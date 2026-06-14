# TomTom Home Assistant Add-ons

This repository contains Home Assistant add-ons by TomTom.

## Add-ons

- **Invoice Portal** - self-hosted invoice, time tracking and accounting portal for small businesses.

## CVR lookup note

The add-on ships with a generic CVR User-Agent placeholder. Users should replace it in the add-on Configuration tab with their own app/company/contact text.

## Repository repair note

If Home Assistant says this is not a valid add-on repository, verify these files exist in the GitHub repository root:

- `repository.yaml`
- `invoice-portal/config.yaml`

The `config.yaml` file must be normal multi-line YAML, not collapsed onto one line.
