# Changelog

## 1.14.5

- Fixed Home Assistant repository visibility/build compatibility after v1.14.4.
- Removed legacy build.yaml dependency and changed Dockerfile to use an explicit Home Assistant base image.
- Added required Home Assistant image labels.

## 1.14.4

- Moved language selection into the Settings page.
- Moved logout into the Settings menu/dropdown and Settings page account section.
- Removed the separate top-bar language selector and standalone logout button.

## 1.14.3

- Made the default CVR User-Agent generic for redistribution.
- Updated CVR error guidance so each user is told to enter their own company/contact text.
- Added README notes for configuring CVR lookup.

## 1.14.2

- Renamed Home Assistant add-on to **Invoice Portal**.
- Added `app_language` option for Danish/English default language.
- Added in-app language switcher.
- Added browser-side UI translation layer for English.

## 1.14.0

- Added time-to-invoice workflow.
- Added time-to-expense workflow.
- Added invoice editing and duplication.
