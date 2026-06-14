# Invoice Portal

Invoice Portal is a self-hosted invoice, time tracking and small-business accounting portal packaged as a Home Assistant add-on.

## Languages

The add-on includes Danish and English UI support. Choose the default language in the add-on Configuration tab with `app_language`:

- `da` - Danish
- `en` - English

Users can also switch language from the top bar inside the web UI. The selected language is stored in the browser session.

## Data

All persistent data is stored in the add-on `/data` folder, including:

- SQLite database
- sessions database
- uploaded receipts
- uploaded documents
- company logo

## First start

Change `admin_password` in the add-on Configuration tab before exposing the portal.
