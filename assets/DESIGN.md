---
name: Academic Impact
colors:
  surface: '#fbf8fc'
  surface-dim: '#dbd9dc'
  surface-bright: '#fbf8fc'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f6'
  surface-container: '#efedf0'
  surface-container-high: '#eae7ea'
  surface-container-highest: '#e4e2e5'
  on-surface: '#1b1b1e'
  on-surface-variant: '#44474d'
  inverse-surface: '#303033'
  inverse-on-surface: '#f2f0f3'
  outline: '#75777e'
  outline-variant: '#c5c6ce'
  surface-tint: '#4f5e7f'
  primary: '#000001'
  on-primary: '#ffffff'
  primary-container: '#0a1b38'
  on-primary-container: '#7584a6'
  inverse-primary: '#b7c6ec'
  secondary: '#bc000d'
  on-secondary: '#ffffff'
  secondary-container: '#e4211f'
  on-secondary-container: '#fffbff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#261900'
  on-tertiary-container: '#aa7c00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#b7c6ec'
  on-primary-fixed: '#0a1b38'
  on-primary-fixed-variant: '#384766'
  secondary-fixed: '#ffdad5'
  secondary-fixed-dim: '#ffb4aa'
  on-secondary-fixed: '#410001'
  on-secondary-fixed-variant: '#930008'
  tertiary-fixed: '#ffdea5'
  tertiary-fixed-dim: '#febb10'
  on-tertiary-fixed: '#261900'
  on-tertiary-fixed-variant: '#5d4200'
  background: '#fbf8fc'
  on-background: '#1b1b1e'
  surface-variant: '#e4e2e5'
  navy-900: '#0A1B38'
  navy-800: '#10264A'
  navy-700: '#16325C'
  red-500: '#E3201F'
  red-600: '#C41615'
  red-50: '#FDECEC'
  yellow-400: '#F7B500'
  yellow-50: '#FFF6DC'
  gray-50: '#F4F3F0'
  gray-100: '#D9D9D9'
  gray-200: '#E6E2D9'
  gray-300: '#EDEAE3'
  surface-50: '#F7F8FA'
  text-primary: '#0A1B38'
  text-secondary: '#5C6B7F'
  text-on-dark: '#FFFFFF'
  text-on-dark-muted: '#C3CFE0'
typography:
  display:
    fontFamily: Inter
    fontSize: 64px
    fontWeight: '800'
    lineHeight: '1.05'
  display-mobile:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '800'
    lineHeight: '1.10'
  headline-lg:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '800'
    lineHeight: '1.10'
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '800'
    lineHeight: '1.15'
  headline-md:
    fontFamily: Inter
    fontSize: 23px
    fontWeight: '600'
    lineHeight: '1.25'
  headline-sm:
    fontFamily: Inter
    fontSize: 19px
    fontWeight: '700'
    lineHeight: '1.30'
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.60'
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.65'
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.50'
  eyebrow:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: '1.40'
    letterSpacing: 0.08em
  label-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: '1.30'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 3rem
  margin-mobile: 1.5rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
  space-2xl: 5.5rem
---

# TNEC Design System

TNEC design system for the current Elementor build. This file is the source of truth for tokens and core classes. The Elementor kit mirrors the labels here as V4 global variables and global classes. Do not hardcode a hex value, font size, spacing step, radius, or shadow in a page when a token or class exists.

The original palette was extracted from the program page at `tnec.digitalolloka.dev/programs/paket-kursus/` in October 2026. The values below are the canonical values for new work. Inter is the canonical font.

## Color tokens
- `--navy-900`: #0A1B38 (Hero background, primary text, dark cards)
- `--navy-800`: #10264A
- `--navy-700`: #16325C
- `--red-500`: #E3201F (Primary CTA, accent)
- `--red-600`: #C41615
- `--red-50`: #FDECEC
- `--yellow-400`: #F7B500 (Emphasis, icons)
- `--yellow-50`: #FFF6DC
- `--white`: #FFFFFF
- `--gray-50`: #F4F3F0 (Page background)
- `--gray-100`: #D9D9D9
- `--gray-200`: #E6E2D9 (Borders)
- `--gray-300`: #EDEAE3
- `--surface-50`: #F7F8FA
- `--text-primary`: #0A1B38
- `--text-secondary`: #5C6B7F
- `--text-on-dark`: #FFFFFF
- `--text-on-dark-muted`: #C3CFE0

## Typography
Font: Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif
Weights: 400, 600, 700, 800
- Display: 64px, 800, line-height 1.05
- H1: 40px, 800, line-height 1.10
- Section: clamp(28px, 3.4vw, 40px), 800, line-height 1.15
- H2: 23px, 600
- H3 (Card title): 19px, 700, line-height 1.30
- Body: 16px, 400, line-height 1.60
- Card body: 15px, 400, line-height 1.65
- Small: 13px, 400
- Eyebrow: 11px, 700, tracking 0.08em uppercase

## Spacing & Radius
- Radius: sm 8px, md 12px, lg 16px, xl 24px, pill 999px
- Page gutter: clamp(24px, 3vw, 48px)
- Section y: 88px
- Shadow card: 0 1px 2px rgba(10,27,56,.06), 0 8px 24px rgba(10,27,56,.06)
- Shadow hover: 0 2px 4px rgba(10,27,56,.06), 0 16px 32px rgba(10,27,56,.12)
- Shadow CTA: 0 6px 16px rgba(227,32,31,.28)
