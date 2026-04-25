#include "AppHdr.h"

#ifdef USE_TILE_LOCAL
#ifdef USE_GL

#include "glwrapper-ogl.h"

// How do we get access to the GL calls?
// If other UI types use the -ogl wrapper they should
// include more conditional includes here.
#ifdef USE_SDL
# ifdef USE_GLES
#  ifdef __ANDROID__
#   include <SDL.h>
#  else
#   include <SDL2/SDL.h>
#   include <SDL_gles.h>
#  endif
#  include <GLES/gl.h>
# else
#  include <SDL_opengl.h>
#  include <SDL_video.h>
# endif
#endif

#include "options.h"
#include "stringutil.h"
#include "tilesdl.h"

#ifdef __ANDROID__
# include <android/log.h>
#endif

#ifdef __EMSCRIPTEN__
# include <emscripten.h>
// SDL_opengl.h under Emscripten does not pull in the modern GL prototypes
// (glCreateShader, glGenBuffers, etc.). Bring in GLES3 explicitly for the
// shader/buffer/uniform calls used by the GLES2 path below. WebGL2 maps to
// GLES 3.0, so this header is the right entry point.
# include <GLES3/gl3.h>

// GLES2/WebGL2 shader pipeline that replaces DCSS's GL 1.x fixed-function path.
// Two programs cover all current draw calls:
//   - textured: sprites, tile atlases, glyphs (UV + per-vertex color modulation)
//   - solid:    border lines, untextured colored rectangles
// The matrix stack is replaced by two manual 4x4 matrices (proj + modelview)
// uploaded as a single uMVP uniform. Alpha test (glAlphaFunc(GL_NOTEQUAL, ref))
// is implemented as a fragment-shader discard.
namespace dcss_es2
{
    struct Mat4
    {
        // Column-major (OpenGL convention).
        float m[16];

        void set_identity()
        {
            for (int i = 0; i < 16; i++)
                m[i] = 0.0f;
            m[0] = m[5] = m[10] = m[15] = 1.0f;
        }

        void set_ortho(float l, float r, float b, float t, float n, float f)
        {
            for (int i = 0; i < 16; i++)
                m[i] = 0.0f;
            m[0]  = 2.0f / (r - l);
            m[5]  = 2.0f / (t - b);
            m[10] = -2.0f / (f - n);
            m[12] = -(r + l) / (r - l);
            m[13] = -(t + b) / (t - b);
            m[14] = -(f + n) / (f - n);
            m[15] = 1.0f;
        }

        // this = this * translate(x, y, z)
        void translate(float x, float y, float z)
        {
            m[12] += m[0] * x + m[4] * y + m[8]  * z;
            m[13] += m[1] * x + m[5] * y + m[9]  * z;
            m[14] += m[2] * x + m[6] * y + m[10] * z;
            m[15] += m[3] * x + m[7] * y + m[11] * z;
        }

        // this = this * scale(x, y, z)
        void scale(float x, float y, float z)
        {
            m[0] *= x; m[1] *= x; m[2]  *= x; m[3]  *= x;
            m[4] *= y; m[5] *= y; m[6]  *= y; m[7]  *= y;
            m[8] *= z; m[9] *= z; m[10] *= z; m[11] *= z;
        }

        static Mat4 multiply(const Mat4 &a, const Mat4 &b)
        {
            Mat4 r;
            for (int i = 0; i < 4; i++)
                for (int j = 0; j < 4; j++)
                {
                    float v = 0.0f;
                    for (int k = 0; k < 4; k++)
                        v += a.m[i + k * 4] * b.m[k + j * 4];
                    r.m[i + j * 4] = v;
                }
            return r;
        }
    };

    static const char *kVS_Textured = R"(#version 300 es
precision mediump float;
in vec3 aPos;
in vec2 aUV;
in vec4 aColor;
out vec2 vUV;
out vec4 vColor;
uniform mat4 uMVP;
void main() {
    gl_Position = uMVP * vec4(aPos, 1.0);
    vUV = aUV;
    vColor = aColor;
}
)";

    static const char *kFS_Textured = R"(#version 300 es
precision mediump float;
in vec2 vUV;
in vec4 vColor;
out vec4 fragColor;
uniform sampler2D uTex;
uniform float uAlphaRef;  // < 0 means alpha test disabled
void main() {
    vec4 c = texture(uTex, vUV) * vColor;
    if (uAlphaRef >= 0.0 && abs(c.a - uAlphaRef) < (1.0/510.0))
        discard;
    fragColor = c;
}
)";

    static const char *kVS_Solid = R"(#version 300 es
precision mediump float;
in vec3 aPos;
in vec4 aColor;
out vec4 vColor;
uniform mat4 uMVP;
void main() {
    gl_Position = uMVP * vec4(aPos, 1.0);
    vColor = aColor;
}
)";

    static const char *kFS_Solid = R"(#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 fragColor;
void main() { fragColor = vColor; }
)";

    struct Program
    {
        GLuint program = 0;
        GLint a_pos = -1;
        GLint a_uv = -1;
        GLint a_color = -1;
        GLint u_mvp = -1;
        GLint u_tex = -1;
        GLint u_alpha_ref = -1;
    };

    static Program g_textured;
    static Program g_solid;

    // Shared dynamic VBOs/IBO (uploaded fresh on each draw).
    static GLuint g_vbo_pos = 0;
    static GLuint g_vbo_uv  = 0;
    static GLuint g_vbo_col = 0;
    static GLuint g_ibo     = 0;

    // Replaces the PROJECTION / MODELVIEW matrix stack.
    static Mat4 g_proj;
    static Mat4 g_modelview;

    // Carried-forward state from OGLStateManager::set() to draw time.
    static bool g_alpha_test_enabled = false;
    static unsigned char g_alpha_ref = 0;
    static float g_const_r = 1.0f, g_const_g = 1.0f,
                 g_const_b = 1.0f, g_const_a = 1.0f;
    static bool g_initialized = false;

    static GLuint compile_shader(GLenum type, const char *src)
    {
        GLuint s = glCreateShader(type);
        glShaderSource(s, 1, &src, nullptr);
        glCompileShader(s);
        GLint ok = 0;
        glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
        if (!ok)
        {
            char log[2048];
            GLsizei len = 0;
            glGetShaderInfoLog(s, sizeof(log), &len, log);
            fprintf(stderr, "[dcss/gles2] %s shader compile failed:\n%s\n",
                    type == GL_VERTEX_SHADER ? "vertex" : "fragment", log);
            glDeleteShader(s);
            return 0;
        }
        return s;
    }

    static bool link_program(Program &p, const char *vs_src, const char *fs_src,
                             bool textured)
    {
        GLuint vs = compile_shader(GL_VERTEX_SHADER, vs_src);
        GLuint fs = compile_shader(GL_FRAGMENT_SHADER, fs_src);
        if (!vs || !fs)
            return false;
        p.program = glCreateProgram();
        glAttachShader(p.program, vs);
        glAttachShader(p.program, fs);
        glLinkProgram(p.program);
        GLint ok = 0;
        glGetProgramiv(p.program, GL_LINK_STATUS, &ok);
        if (!ok)
        {
            char log[2048];
            GLsizei len = 0;
            glGetProgramInfoLog(p.program, sizeof(log), &len, log);
            fprintf(stderr, "[dcss/gles2] program link failed:\n%s\n", log);
            glDeleteProgram(p.program);
            p.program = 0;
            return false;
        }
        glDeleteShader(vs);
        glDeleteShader(fs);
        p.a_pos   = glGetAttribLocation(p.program, "aPos");
        p.a_color = glGetAttribLocation(p.program, "aColor");
        p.u_mvp   = glGetUniformLocation(p.program, "uMVP");
        if (textured)
        {
            p.a_uv        = glGetAttribLocation(p.program, "aUV");
            p.u_tex       = glGetUniformLocation(p.program, "uTex");
            p.u_alpha_ref = glGetUniformLocation(p.program, "uAlphaRef");
        }
        return true;
    }

    static void init_shaders()
    {
        if (g_initialized)
            return;
        if (!link_program(g_textured, kVS_Textured, kFS_Textured, true))
            fprintf(stderr, "[dcss/gles2] failed to build textured shader\n");
        if (!link_program(g_solid, kVS_Solid, kFS_Solid, false))
            fprintf(stderr, "[dcss/gles2] failed to build solid shader\n");
        glGenBuffers(1, &g_vbo_pos);
        glGenBuffers(1, &g_vbo_uv);
        glGenBuffers(1, &g_vbo_col);
        glGenBuffers(1, &g_ibo);
        g_proj.set_identity();
        g_modelview.set_identity();
        g_initialized = true;
    }
}  // namespace dcss_es2

#endif  // __EMSCRIPTEN__

// TODO: if this gets big enough, pull out into opengl-utils.cc/h or sth
namespace opengl
{
    bool check_texture_size(const char *name, int width, int height)
    {
        int max_texture_size;
        glGetIntegerv(GL_MAX_TEXTURE_SIZE, &max_texture_size);
        if (width > max_texture_size || height > max_texture_size)
        {
            mprf(MSGCH_ERROR,
                "Texture %s is bigger than maximum driver texture size "
                "(%d,%d vs. %d). Sprites from this texture will not display "
                "properly.",
                name, width, height, max_texture_size);
            return false;
        }
        return true;
    }

    static string _gl_error_to_string(GLenum e)
    {
        switch (e)
        {
        case GL_NO_ERROR:
            return "GL_NO_ERROR";
        case GL_INVALID_ENUM:
            return "GL_INVALID_ENUM";
        case GL_INVALID_VALUE:
            return "GL_INVALID_VALUE";
        case GL_INVALID_OPERATION:
            return "GL_INVALID_OPERATION";
#ifndef __ANDROID__
        case GL_INVALID_FRAMEBUFFER_OPERATION:
            return "GL_INVALID_FRAMEBUFFER_OPERATION";
#endif
        case GL_OUT_OF_MEMORY:
            return "GL_OUT_OF_MEMORY (fatal)";
        case GL_STACK_UNDERFLOW:
            return "GL_STACK_UNDERFLOW";
        case GL_STACK_OVERFLOW:
            return "GL_STACK_OVERFLOW";
        default:
            return make_stringf("Unknown OpenGL error %d", e);
        }
    }

    /**
     * Log any opengl errors to console. Will crash if a really bad one occurs.
     *
     * @return true if there were any errors.
     */
    bool flush_opengl_errors()
    {
        GLenum e = GL_NO_ERROR;
        bool fatal = false;
        bool errors = false;
        do
        {
            e = glGetError();
            if (e != GL_NO_ERROR)
            {
                errors = true;
                if (e == GL_OUT_OF_MEMORY)
                    fatal = true;
                mprf(MSGCH_ERROR, "OpenGL error %s",
                                        _gl_error_to_string(e).c_str());
            }
        } while (e != GL_NO_ERROR);
        if (fatal)
            die("Fatal OpenGL error; giving up");
        return errors;
    }
}

/////////////////////////////////////////////////////////////////////////////
// Static functions from GLStateManager

GLStateManager *glmanager = nullptr;

void GLStateManager::init()
{
    if (glmanager)
        return;

    glmanager = new OGLStateManager();
}

void GLStateManager::shutdown()
{
    delete glmanager;
    glmanager = nullptr;
}

/////////////////////////////////////////////////////////////////////////////
// Static functions from GLShapeBuffer

GLShapeBuffer *GLShapeBuffer::create(bool texture, bool colour,
                                     drawing_modes prim)
{
    return new OGLShapeBuffer(texture, colour, prim);
}

/////////////////////////////////////////////////////////////////////////////
// OGLStateManager

OGLStateManager::OGLStateManager()
{
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    glClearColor(0.0, 0.0, 0.0, 1.0f);
    glDepthFunc(GL_LEQUAL);

    m_window_height = 0;
#ifdef __EMSCRIPTEN__
    // The Emscripten/SDL2 GL context is WebGL2 (GLES 3.0). The fixed-function
    // pipeline doesn't exist; we run a tiny GLES2 shader path instead. The
    // SDL_GL_LoadLibrary + glGetString version-string parsing below would
    // misbehave under WebGL anyway (glGetString returns "WebGL 2.0 ..."), so
    // skip it entirely. Mipmaps are off in this path (not load-bearing).
    dcss_es2::init_shaders();
#elif !defined(USE_GLES)
    // TODO: we probably can do this for GLES TOO, but maybe requires tweaks?

    // OpenGL doesn't specify what the GetProcAddress function returns
    // if the implementation does not support a function
    // (e.g. because it doesn't support the OpenGL version in question)
    // So we need to check the version before we try to get the
    // glGenerateMipmap function.
    const GLubyte* versionString = glGetString(GL_VERSION);
    if (versionString == nullptr)
    {
        mprf("Mipmap Setup: Failed to load OpenGL version.");
        return;
    }
    // We will never see 2 digit OpenGL major versions - 4.6 came out in 2016,
    // and Vulkan is carrying the torch now
    //
    // It's doubtful we'll even see an OpenGL 5.
    // But we'll be paranoid. We'll consider OpenGL 3.X - 9.X as all fine
    bool supported_first_digit = ('3' <= versionString[0]) &&
                                 (versionString[0] <= '9');
    // Anything other than X.Y would be very weird.
    // It's incredibly unlikely OpenGL 10 will ever exist.
    bool second_character_is_dot = versionString[1] == '.';
    if (!supported_first_digit || !second_character_is_dot)
    {
        mprf("Mipmap Setup: Disabled because OpenGL version: %s does not "
             "provide glGenerateMipmap.", versionString);
        return;
    }

    // We have to load the library dynamically before we can load the function
    // from the library via GetProcAddress.
    // That's how dynamic loading works.
    // It's possible the library is already loaded anyway,
    // but we're being careful here.
    if (SDL_GL_LoadLibrary(NULL) != 0)
    {
        // success == 0 for this API.
        // If we can't load it, we probably wouldn't get this far at all.
        // But just in case, we'll handle it.
        mprf("Mipmap Setup: Disabled because SDL_GL_LoadLibrary failed.");
        return;
    }

    // Because we already checked the version is higher enough,
    // SDL_GL_GetProcAddress should always get a non-null pointer back.
    // But we'll log in case this does somehow happen.
    m_mipmapFn = SDL_GL_GetProcAddress("glGenerateMipmap");
    if (m_mipmapFn == nullptr)
    {
        mprf("Mipmap Setup: Failed to load glGenerateMipmap function.");
        return;
    }
    else
    {
        mprf("Mipmap Setup: success, loaded with OpenGL version: %s",
             versionString);
    }
#else
    mprf("Mipmap Setup: skipped, not supported in this build configuration.");
#endif
}

void OGLStateManager::set(const GLState& state)
{
#ifndef __EMSCRIPTEN__
    if (state.array_vertex != m_current_state.array_vertex)
    {
        if (state.array_vertex)
        {
            glEnableClientState(GL_VERTEX_ARRAY);
            glDebug("glEnableClientState(GL_VERTEX_ARRAY)");
        }
        else
        {
            glDisableClientState(GL_VERTEX_ARRAY);
            glDebug("glDisableClientState(GL_VERTEX_ARRAY)");
        }
    }

    if (state.array_texcoord != m_current_state.array_texcoord)
    {
        if (state.array_texcoord)
        {
            glEnableClientState(GL_TEXTURE_COORD_ARRAY);
            glDebug("glEnableClientState(GL_TEXTURE_COORD_ARRAY)");
        }
        else
        {
            glDisableClientState(GL_TEXTURE_COORD_ARRAY);
            glDebug("glDisableClientState(GL_TEXTURE_COORD_ARRAY)");
        }
    }

    if (state.array_colour != m_current_state.array_colour)
    {
        if (state.array_colour)
        {
            glEnableClientState(GL_COLOR_ARRAY);
            glDebug("glEnableClientState(GL_COLOR_ARRAY)");
        }
        else
        {
            glDisableClientState(GL_COLOR_ARRAY);
            glDebug("glDisableClientState(GL_COLOR_ARRAY)");

            // [enne] This should *not* be necessary, but the Linux OpenGL
            // driver that I'm using sets this to the last colour of the
            // colour array. So, we need to unset it here.
            glColor4f(1.0f, 1.0f, 1.0f, 1.0f);
            glDebug("glColor4f(1.0f, 1.0f, 1.0f, 1.0f)");
        }
    }

    if (state.texture != m_current_state.texture)
    {
        if (state.texture)
        {
            glEnable(GL_TEXTURE_2D);
            glDebug("glEnable(GL_TEXTURE_2D)");
        }
        else
        {
            glDisable(GL_TEXTURE_2D);
            glDebug("glDisable(GL_TEXTURE_2D)");
        }
    }
#endif  // !__EMSCRIPTEN__

    if (state.blend != m_current_state.blend)
    {
        if (state.blend)
        {
            glEnable(GL_BLEND);
            glDebug("glEnable(GL_BLEND)");
        }
        else
        {
            glDisable(GL_BLEND);
            glDebug("glDisable(GL_BLEND)");
        }
    }

    if (state.depthtest != m_current_state.depthtest)
    {
        if (state.depthtest)
        {
            glEnable(GL_DEPTH_TEST);
            glDebug("glEnable(GL_DEPTH_TEST)");
        }
        else
        {
            glDisable(GL_DEPTH_TEST);
            glDebug("glEnable(GL_DEPTH_TEST)");
        }
    }

    if (state.alphatest != m_current_state.alphatest
        || state.alpharef != m_current_state.alpharef)
    {
#ifdef __EMSCRIPTEN__
        // No GL_ALPHA_TEST under WebGL; emulated via fragment-shader discard
        // in the textured shader (uAlphaRef uniform).
        dcss_es2::g_alpha_test_enabled = state.alphatest;
        dcss_es2::g_alpha_ref          = state.alpharef;
#else
        if (state.alphatest)
        {
            glEnable(GL_ALPHA_TEST);
            glAlphaFunc(GL_NOTEQUAL, state.alpharef);
            glDebug("glAlphaFunc(GL_NOTEQUAL, state.alpharef)");
        }
        else
        {
            glDisable(GL_ALPHA_TEST);
            glDebug("glDisable(GL_ALPHA_TEST)");
        }
#endif
    }

    if (state.colour != m_current_state.colour)
    {
#ifdef __EMSCRIPTEN__
        // glColor4f doesn't exist; record for the next draw to set as a
        // constant vertex attribute when there is no per-vertex colour.
        // GLState::colour is normalized [0,1] (see VColour usage).
        dcss_es2::g_const_r = static_cast<float>(state.colour.r) / 255.0f;
        dcss_es2::g_const_g = static_cast<float>(state.colour.g) / 255.0f;
        dcss_es2::g_const_b = static_cast<float>(state.colour.b) / 255.0f;
        dcss_es2::g_const_a = static_cast<float>(state.colour.a) / 255.0f;
#else
        glColor4f(state.colour.r, state.colour.g,
                  state.colour.b, state.colour.a);
        glDebug("glColor4f");
#endif
    }

    m_current_state = state;
}

struct {
    GLW_3VF trans, scale;
} current_transform;

void OGLStateManager::set_transform(const GLW_3VF &trans, const GLW_3VF &scale)
{
#ifdef __EMSCRIPTEN__
    dcss_es2::g_modelview.set_identity();
    dcss_es2::g_modelview.translate(trans.x, trans.y, trans.z);
    dcss_es2::g_modelview.scale(scale.x, scale.y, scale.z);
#else
    glLoadIdentity();
    glTranslatef(trans.x, trans.y, trans.z);
    glScalef(scale.x, scale.y, scale.z);
#endif
    current_transform = { trans, scale };
}

void OGLStateManager::reset_transform()
{
    set_transform({0,0,0}, {1,1,1});
}

void OGLStateManager::get_transform(GLW_3VF *trans, GLW_3VF *scale)
{
    if (trans)
        *trans = current_transform.trans;
    if (scale)
        *scale = current_transform.scale;
}

int OGLStateManager::logical_to_device(int n) const
{
    return display_density.logical_to_device(n);
}

int OGLStateManager::device_to_logical(int n, bool round) const
{
    return display_density.device_to_logical(n, round);
}

void OGLStateManager::set_scissor(int x, int y, unsigned int w, unsigned int h)
{
    glEnable(GL_SCISSOR_TEST);
    glScissor(logical_to_device(x), logical_to_device(m_window_height-y-h),
                logical_to_device(w), logical_to_device(h));
}

void OGLStateManager::reset_scissor()
{
    glDisable(GL_SCISSOR_TEST);
}

void OGLStateManager::reset_view_for_resize(const coord_def &m_windowsz,
                                            const coord_def &m_drawablesz)
{
    glViewport(0, 0, m_drawablesz.x, m_drawablesz.y);
    m_window_height = m_windowsz.y;

#ifdef __EMSCRIPTEN__
    // Vertex positions are pixel positions; Y axis is flipped (top = 0).
    dcss_es2::g_proj.set_ortho(0, m_windowsz.x, m_windowsz.y, 0, -1000, 1000);
#else
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();

    // For ease, vertex positions are pixel positions.
# ifdef USE_GLES
#  ifdef __ANDROID__
    glOrthof(0, m_windowsz.x, m_windowsz.y, 0, -1000, 1000);
#  else
    glOrthox(0, m_windowsz.x, m_windowsz.y, 0, -1000, 1000);
#  endif
# else
    glOrtho(0, m_windowsz.x, m_windowsz.y, 0, -1000, 1000);
# endif
    glDebug("glOrthof");
#endif
}

void OGLStateManager::pixelstore_unpack_alignment(unsigned int bpp)
{
    glPixelStorei(GL_UNPACK_ALIGNMENT, bpp);
    glDebug("glPixelStorei");
}

void OGLStateManager::delete_textures(size_t count, unsigned int *textures)
{
    glDeleteTextures(count, (GLuint*)textures);
    glDebug("glDeleteTextures");
}

void OGLStateManager::generate_textures(size_t count, unsigned int *textures)
{
    glGenTextures(count, (GLuint*)textures);
    glDebug("glGenTextures");
}

void OGLStateManager::bind_texture(unsigned int texture)
{
    glBindTexture(GL_TEXTURE_2D, texture);
    glDebug("glBindTexture");
}

void OGLStateManager::load_texture(unsigned char *pixels, unsigned int width,
                                   unsigned int height, MipMapOptions mip_opt,
                                   int xoffset, int yoffset)
{
    // Assumptions...
#if defined(__ANDROID__) || defined(__EMSCRIPTEN__)
    // WebGL/GLES2 reject numeric internalformat (must be a sized/symbolic enum).
    const GLenum bpp = GL_RGBA;
#else
    const unsigned int bpp = 4;
#endif
    const GLenum texture_format = GL_RGBA;
    const GLenum format = GL_UNSIGNED_BYTE;
    // Also assume that the texture is already bound using bind_texture

#ifndef __EMSCRIPTEN__
    // GL_TEXTURE_ENV / GL_MODULATE is the fixed-function "texture * vertex
    // colour" combiner. The GLES2 shader path below does this in the fragment
    // shader instead (texture(uTex, vUV) * vColor), so the call is unneeded
    // and would raise INVALID_ENUM under WebGL.
    glTexEnvf(GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, GL_MODULATE);
    glDebug("glTexEnvf");
#endif

#if defined(GL_CLAMP) && !defined(__EMSCRIPTEN__)
    // WebGL/GLES2/3 reject GL_CLAMP (only GL_CLAMP_TO_EDGE is valid). The
    // Emscripten GLES3 headers still define GL_CLAMP for portability with
    // legacy code, so the bare #ifdef would silently take the wrong branch.
    glTexParameterf(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP);
    glTexParameterf(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP);
#else
    glTexParameterf(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glDebug("glTexParameterf GL_TEXTURE_WRAP_S");
    glTexParameterf(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glDebug("glTexParameterf GL_TEXTURE_WRAP_T");
#endif
#ifndef USE_GLES
    if (mip_opt == MIPMAP_CREATE)
    {
        // TODO: should min react to Options.tile_filter_scaling?
        glTexParameterf(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER,
                        m_mipmapFn != nullptr ? GL_LINEAR_MIPMAP_NEAREST :
                        Options.tile_filter_scaling ? GL_LINEAR :
                        GL_NEAREST);
        glTexParameterf(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER,
                        Options.tile_filter_scaling ? GL_LINEAR : GL_NEAREST);
        glTexImage2D(GL_TEXTURE_2D, 0, bpp, width, height, 0,
                     texture_format, format, pixels);
        // TODO: possibly restructure this into the main block below
        // so that we support mipmapping when glTexSubImage2D should be called.
        if (m_mipmapFn != nullptr)
        {
            PFNGLGENERATEMIPMAPPROC mipmapFn =
                    reinterpret_cast<PFNGLGENERATEMIPMAPPROC>(m_mipmapFn);
            mipmapFn(GL_TEXTURE_2D);
        }
    }
    else
#endif
    {
        glTexParameterf(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER,
                        Options.tile_filter_scaling ? GL_LINEAR : GL_NEAREST);
        glTexParameterf(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER,
                        Options.tile_filter_scaling ? GL_LINEAR : GL_NEAREST);
        if (xoffset >= 0 && yoffset >= 0)
        {
            glTexSubImage2D(GL_TEXTURE_2D, 0, xoffset, yoffset, width, height,
                         texture_format, format, pixels);
            glDebug("glTexSubImage2D");
        }
        else
        {
            glTexImage2D(GL_TEXTURE_2D, 0, bpp, width, height, 0,
                         texture_format, format, pixels);
            glDebug("glTexImage2D");
        }
    }
}

void OGLStateManager::reset_view_for_redraw()
{
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
#ifdef __EMSCRIPTEN__
    dcss_es2::g_modelview.set_identity();
    dcss_es2::g_modelview.translate(0.0f, 0.0f, 1.0f);
#else
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();

    glTranslatef(0.0f, 0.0f, 1.0f);
    glDebug("glTranslatef");
#endif
}

bool OGLStateManager::glDebug(const char* msg) const
{
#if defined(__ANDROID__) || defined(DEBUG_DIAGNOSTICS)
    int e = glGetError();
    if (e > 0)
    {
# ifdef __ANDROID__
        __android_log_print(ANDROID_LOG_INFO, "Crawl.gl", "ERROR %x: %s", e, msg);
# else
        fprintf(stderr, "OGLStateManager ERROR %x: %s\n", e, msg);
# endif
        return true;
    }
#else
    UNUSED(msg);
#endif
    return false;
}

/////////////////////////////////////////////////////////////////////////////
// OGLShapeBuffer

OGLShapeBuffer::OGLShapeBuffer(bool texture, bool colour, drawing_modes prim) :
    m_prim_type(prim),
    m_texture_verts(texture),
    m_colour_verts(colour)
{
    ASSERT(prim == GLW_RECTANGLE || prim == GLW_LINES);
}

const char *OGLShapeBuffer::print_statistics() const
{
    return nullptr;
}

unsigned int OGLShapeBuffer::size() const
{
    return m_position_buffer.size();
}

void OGLShapeBuffer::add(const GLWPrim &rect)
{
    switch (m_prim_type)
    {
    case GLW_RECTANGLE:
        add_rect(rect);
        break;
    case GLW_LINES:
        add_line(rect);
        break;
    default:
        die("Invalid primitive type");
        break;
    }
}

void OGLShapeBuffer::add_rect(const GLWPrim &rect)
{
    // Copy vert positions
    size_t last = m_position_buffer.size();
    m_position_buffer.resize(last + 4);
    m_position_buffer[last    ].set(rect.pos_sx, rect.pos_sy, rect.pos_z);
    m_position_buffer[last + 1].set(rect.pos_sx, rect.pos_ey, rect.pos_z);
    m_position_buffer[last + 2].set(rect.pos_ex, rect.pos_sy, rect.pos_z);
    m_position_buffer[last + 3].set(rect.pos_ex, rect.pos_ey, rect.pos_z);

    // Copy texture coords if necessary
    if (m_texture_verts)
    {
        last = m_texture_buffer.size();
        m_texture_buffer.resize(last + 4);
        m_texture_buffer[last    ].set(rect.tex_sx, rect.tex_sy);
        m_texture_buffer[last + 1].set(rect.tex_sx, rect.tex_ey);
        m_texture_buffer[last + 2].set(rect.tex_ex, rect.tex_sy);
        m_texture_buffer[last + 3].set(rect.tex_ex, rect.tex_ey);
    }

    // Copy vert colours if necessary
    if (m_colour_verts)
    {
        last = m_colour_buffer.size();
        m_colour_buffer.resize(last + 4);
        m_colour_buffer[last    ].set(rect.col_s);
        m_colour_buffer[last + 1].set(rect.col_e);
        m_colour_buffer[last + 2].set(rect.col_s);
        m_colour_buffer[last + 3].set(rect.col_e);
    }

    // build indices
    last = m_ind_buffer.size();

    if (last > 3)
    {
        // This is not the first box so make FOUR degenerate triangles
        m_ind_buffer.resize(last + 6);
        unsigned short int val = m_ind_buffer[last - 1];

        // the first three degens finish the previous box and move
        // to the first position of the new one we just added and
        // the fourth degen creates a triangle that is a line from p1 to p3
        m_ind_buffer[last    ] = val++;
        m_ind_buffer[last + 1] = val;

        // Now add as normal
        m_ind_buffer[last + 2] = val++;
        m_ind_buffer[last + 3] = val++;
        m_ind_buffer[last + 4] = val++;
        m_ind_buffer[last + 5] = val;
    }
    else
    {
        // This is the first box so don't bother making any degenerate triangles
        m_ind_buffer.resize(last + 4);
        m_ind_buffer[0] = 0;
        m_ind_buffer[1] = 1;
        m_ind_buffer[2] = 2;
        m_ind_buffer[3] = 3;
    }
}

void OGLShapeBuffer::add_line(const GLWPrim &rect)
{
    // Copy vert positions
    size_t last = m_position_buffer.size();
    m_position_buffer.resize(last + 2);
    m_position_buffer[last    ].set(rect.pos_sx, rect.pos_sy, rect.pos_z);
    m_position_buffer[last + 1].set(rect.pos_ex, rect.pos_ey, rect.pos_z);

    // Copy texture coords if necessary
    if (m_texture_verts)
    {
        last = m_texture_buffer.size();
        m_texture_buffer.resize(last + 2);
        m_texture_buffer[last    ].set(rect.tex_sx, rect.tex_sy);
        m_texture_buffer[last + 1].set(rect.tex_ex, rect.tex_ey);
    }

    // Copy vert colours if necessary
    if (m_colour_verts)
    {
        last = m_colour_buffer.size();
        m_colour_buffer.resize(last + 2);
        m_colour_buffer[last    ].set(rect.col_s);
        m_colour_buffer[last + 1].set(rect.col_e);
    }
}

// Draw the buffer
void OGLShapeBuffer::draw(const GLState &state)
{
    if (m_position_buffer.empty())
        return;

    if (!state.array_vertex)
        return;

    glmanager->set(state);

#ifdef __EMSCRIPTEN__
    using namespace dcss_es2;

    const bool use_textured = state.array_texcoord && m_texture_verts;
    const Program &prog = use_textured ? g_textured : g_solid;
    if (prog.program == 0)
        return;
    glUseProgram(prog.program);

    Mat4 mvp = Mat4::multiply(g_proj, g_modelview);
    glUniformMatrix4fv(prog.u_mvp, 1, GL_FALSE, mvp.m);

    if (use_textured)
    {
        glUniform1i(prog.u_tex, 0);
        const float ref = g_alpha_test_enabled
                          ? static_cast<float>(g_alpha_ref) / 255.0f
                          : -1.0f;
        glUniform1f(prog.u_alpha_ref, ref);
    }

    // Position (vec3 float)
    glBindBuffer(GL_ARRAY_BUFFER, g_vbo_pos);
    glBufferData(GL_ARRAY_BUFFER,
                 m_position_buffer.size() * sizeof(GLW_3VF),
                 m_position_buffer.data(), GL_DYNAMIC_DRAW);
    glEnableVertexAttribArray(prog.a_pos);
    glVertexAttribPointer(prog.a_pos, 3, GL_FLOAT, GL_FALSE, 0, 0);

    if (use_textured)
    {
        glBindBuffer(GL_ARRAY_BUFFER, g_vbo_uv);
        glBufferData(GL_ARRAY_BUFFER,
                     m_texture_buffer.size() * sizeof(GLW_2VF),
                     m_texture_buffer.data(), GL_DYNAMIC_DRAW);
        glEnableVertexAttribArray(prog.a_uv);
        glVertexAttribPointer(prog.a_uv, 2, GL_FLOAT, GL_FALSE, 0, 0);
    }

    if (state.array_colour && m_colour_verts)
    {
        glBindBuffer(GL_ARRAY_BUFFER, g_vbo_col);
        glBufferData(GL_ARRAY_BUFFER,
                     m_colour_buffer.size() * sizeof(VColour),
                     m_colour_buffer.data(), GL_DYNAMIC_DRAW);
        glEnableVertexAttribArray(prog.a_color);
        glVertexAttribPointer(prog.a_color, 4, GL_UNSIGNED_BYTE,
                              GL_TRUE /* normalize */, 0, 0);
    }
    else
    {
        // No per-vertex colour — supply a constant attribute (fast path
        // available since WebGL 1; no draw-call upload).
        glDisableVertexAttribArray(prog.a_color);
        glVertexAttrib4f(prog.a_color,
                         g_const_r, g_const_g, g_const_b, g_const_a);
    }

    switch (m_prim_type)
    {
    case GLW_RECTANGLE:
        glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, g_ibo);
        glBufferData(GL_ELEMENT_ARRAY_BUFFER,
                     m_ind_buffer.size() * sizeof(unsigned short int),
                     m_ind_buffer.data(), GL_DYNAMIC_DRAW);
        glDrawElements(GL_TRIANGLE_STRIP, m_ind_buffer.size(),
                       GL_UNSIGNED_SHORT, 0);
        break;
    case GLW_LINES:
        glDrawArrays(GL_LINES, 0, m_position_buffer.size());
        break;
    default:
        die("Invalid primitive type");
        break;
    }

    // Detach attribute arrays so the next draw with a different shader
    // (potentially different attribute locations) starts clean.
    glDisableVertexAttribArray(prog.a_pos);
    if (use_textured)
        glDisableVertexAttribArray(prog.a_uv);
    if (state.array_colour && m_colour_verts)
        glDisableVertexAttribArray(prog.a_color);
    glBindBuffer(GL_ARRAY_BUFFER, 0);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0);
#else
    glVertexPointer(3, GL_FLOAT, 0, &m_position_buffer[0]);
    glDebug("glVertexPointer");

    if (state.array_texcoord && m_texture_verts)
        glTexCoordPointer(2, GL_FLOAT, 0, &m_texture_buffer[0]);
    glDebug("glTexCoordPointer");

    if (state.array_colour && m_colour_verts)
        glColorPointer(4, GL_UNSIGNED_BYTE, 0, &m_colour_buffer[0]);
    glDebug("glColorPointer");

    switch (m_prim_type)
    {
    case GLW_RECTANGLE:
        glDrawElements(GL_TRIANGLE_STRIP, m_ind_buffer.size(),
                       GL_UNSIGNED_SHORT, &m_ind_buffer[0]);
        break;
    case GLW_LINES:
        glDrawArrays(GL_LINES, 0, m_position_buffer.size());
        break;
    default:
        die("Invalid primitive type");
        break;
    }
    glDebug("glDrawElements");
#endif  // !__EMSCRIPTEN__
}

void OGLShapeBuffer::clear()
{
    m_position_buffer.clear();
    m_ind_buffer.clear();
    m_texture_buffer.clear();
    m_colour_buffer.clear();
}

bool OGLShapeBuffer::glDebug(const char* msg) const
{
#if defined(__ANDROID__) || defined(DEBUG_DIAGNOSTICS)
    int e = glGetError();
    if (e > 0)
    {
# ifdef __ANDROID__
        __android_log_print(ANDROID_LOG_INFO, "Crawl.gl", "ERROR %x: %s", e, msg);
# else
        fprintf(stderr, "OGLShapeBuffer ERROR %x: %s\n", e, msg);
# endif
        return true;
    }
#else
    UNUSED(msg);
#endif
    return false;
}

#endif // USE_GL
#endif // USE_TILE_LOCAL
