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
## CVR lookup

CVR lookup is enabled by default, but the public CVR service may reject generic or unclear User-Agent values. The default value is intentionally generic:

```yaml
cvr_user_agent: "Invoice Portal Home Assistant Add-on - replace-with-your-contact"
```

For reliable lookups, change it in the add-on Configuration tab to something that identifies the installation owner/contact, for example:

```yaml
cvr_user_agent: "Invoice Portal - My Company - admin@example.com"
```

Do not leave the example contact as-is if you publish or redistribute the add-on. Each user should use their own contact/company text.

