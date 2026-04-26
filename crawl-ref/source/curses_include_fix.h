#ifndef CURSES_SHIM_H
#define CURSES_SHIM_H

#include <stdint.h>
#include <stdio.h>
#include <wchar.h>

// Types
typedef int attr_t;
typedef uint32_t cchar_t;
typedef int wint_t;
typedef struct { int dummy; } WINDOW;
typedef short mmask_t;

// External variables (will be provided by JS glue)
extern WINDOW* stdscr;

// Color constants
#define COLOR_BLACK   0
#define COLOR_RED     1
#define COLOR_GREEN   2
#define COLOR_YELLOW  3
#define COLOR_BLUE    4
#define COLOR_MAGENTA 5
#define COLOR_CYAN    6
#define COLOR_WHITE   7

// Attribute constants
#define A_NORMAL      0
#define A_STANDOUT    (1<<8)
#define A_BOLD        (1<<9)
#define A_BLINK       (1<<10)
#define A_UNDERLINE   (1<<11)
#define A_DIM         (1<<12)
#define A_REVERSE     (1<<13)
#define WA_STANDOUT   A_STANDOUT
#define WA_BOLD       A_BOLD
#define WA_BLINK      A_BLINK
#define WA_UNDERLINE  A_UNDERLINE
#define WA_DIM        A_DIM
#define WA_REVERSE    A_REVERSE
#define WA_NORMAL     A_NORMAL

// Key constants
#define KEY_UP        0x101
#define KEY_DOWN      0x102
#define KEY_LEFT      0x103
#define KEY_RIGHT     0x104
#define KEY_BACKSPACE 0x107
#define KEY_IC        0x14D
#define KEY_DC        0x14C
#define KEY_HOME      0x106
#define KEY_END       0x166
#define KEY_PPAGE     0x153
#define KEY_NPAGE     0x152
#define KEY_BEG       0x155
#define KEY_BTAB      0x161
#define KEY_SDC       0x16D
#define KEY_SHOME     0x167
#define KEY_SEND      0x168
#define KEY_SPREVIOUS 0x169
#define KEY_SNEXT     0x16A
#define KEY_SR        0x16B
#define KEY_SF        0x16C
#define KEY_SLEFT     0x173
#define KEY_SRIGHT    0x174
#define KEY_A1        0x135
#define KEY_A3        0x137
#define KEY_B2        0x138
#define KEY_C1        0x139
#define KEY_C3        0x13B

// Boolean constants
#define TRUE          1
#define FALSE         0

// Error constants
#define ERR           (-1)
#define OK             0
#define KEY_CODE_YES  0400

// Function declarations (implementations provided by JS glue via Emscripten)
#ifdef __cplusplus
extern "C" {
#endif
extern int initscr(void);
extern int endwin(void);
extern int clear(void);
extern int refresh(void);
extern int wrefresh(WINDOW*);
extern int getch(void);
extern int wgetch(WINDOW*);
extern int curs_set(int);
extern int keypad(WINDOW*, int);
extern int start_color(void);
extern int init_pair(short, short, short);
extern int attron(attr_t);
extern int attroff(attr_t);
extern int use_default_colors(void);
extern int nodelay(WINDOW*, int);
extern void timeout(int);
extern int get_wch(wint_t*);
extern int mvaddstr(int, int, const char*);
extern int mvwaddstr(WINDOW*, int, int, const char*);
extern int mvaddch(int, int, const char);
extern int printw(const char*, ...);
extern int addnwstr(const wchar_t*, int);
extern int clrtoeol(void);
extern WINDOW* newwin(int, int, int, int);
extern int delwin(WINDOW*);
extern int move(int, int);
extern int erase(void);
extern int leaveok(WINDOW*, int);
extern int notimeout(WINDOW*, int);
extern int keypad(WINDOW*, int);
extern int nl(void);
extern int nonl(void);
extern int raw(void);
extern int noecho(void);
extern int echo(void);
extern int intrflush(WINDOW*, int);
extern int meta(WINDOW*, int);
extern int scrollok(WINDOW*, int);
extern int set_escdelay(int);
extern int has_key(int);
extern void* tigetstr(const char*);
extern int putwin(WINDOW*, FILE*);
extern WINDOW* derwin(WINDOW*, int, int, int, int);
extern int wechochar(WINDOW*, const char);
extern int mvwaddch(WINDOW*, int, int, const char);
extern int init_color(short, short, short, short);
extern int can_change_color(void);
extern int color_content(short, short*, short*, short*);
extern int pair_content(short, short*, short*);

// Variables (will be provided by JS glue)
extern int LINES;
extern int COLS;
extern int COLORS;
extern int COLOR_PAIRS;
extern int ESCDELAY;
extern char* termname(void);
extern int attr_set(attr_t, short, void*);
extern int mvin_wch(int, int, cchar_t*);
extern int getcchar(const cchar_t*, wchar_t*, attr_t*, short*, void**);
extern int setcchar(cchar_t*, const wchar_t*, attr_t, short, void*);
extern int mvadd_wchnstr(int, int, const cchar_t*, int);
extern int getcurx(WINDOW*);
extern int getcury(WINDOW*);
extern int mvadd_wch(int, int, const char);
extern int add_wch(const char*);
#ifdef __cplusplus
} // extern "C"
#endif

// Signal handling stubs
#define signal(a,b)   ((void (*) (int)) (b))

// No-op stubs for functions that must exist but don't need real implementations
#define curs_set(v)   (0)
#define meta(w,b)     (0)
#define intrflush(w,b) (0)

#endif