# TomTom Home Assistant Add-ons

Home Assistant add-on repository by TomTom.

Repository URL:

```text
https://github.com/tomtomdk/ha-addons
```

## Add-ons

| Add-on | Description | Architectures |
|---|---|---|
| [Invoice Portal](./invoice-portal) | Self-hosted invoice, time tracking, customer, expense, and accounting portal for small businesses. Danish and English UI included. | `aarch64`, `amd64`, `armv7` |
| [Git Repository Mirror](./git-mirror) | Scheduled Git repository mirroring between GitHub, GitLab, Gitea, Forgejo, and other Git hosts. | `aarch64`, `amd64`, `armhf`, `armv7`, `i386` |
| [HA Docker Cleaner](./ha-docker-cleaner) | Scheduled Docker cleanup for Home Assistant OS / Supervised systems, with notifications and conservative defaults. | `aarch64`, `amd64`, `armhf`, `armv7`, `i386` |

## Installation

1. Open Home Assistant.
2. Go to **Settings** -> **Add-ons** -> **Add-on Store**.
3. Open the three-dot menu and choose **Repositories**.
4. Add:

```text
https://github.com/tomtomdk/ha-addons
```

5. Refresh the Add-on Store.
6. Install the add-on you want.

## Invoice Portal

Use this when you want a small self-hosted business portal inside Home Assistant.

Highlights:

- Invoice and customer management
- Time tracking
- Expenses and recurring expenses
- Reports and document handling
- Danish and English UI
- Optional Danish CVR lookup
- Home Assistant ingress support

CVR note: the add-on ships with a generic CVR User-Agent placeholder. Replace `cvr_user_agent` in the add-on configuration with your own app, company, or contact text before relying on CVR lookup.

## Git Repository Mirror

Use this when you want Home Assistant to keep scheduled mirror copies of Git repositories.

Highlights:

- Multiple repositories from one add-on
- GitHub, GitLab, Gitea, Forgejo, and custom HTTPS Git hosts
- Global provider defaults with per-repository overrides
- Safe default mirror mode that avoids force-push and pruning
- Optional Home Assistant, ntfy, Gotify, and Discord notifications

Default mirror mode:

```yaml
mirror_mode: heads-tags
```

Create target repositories before enabling mirroring. For the cleanest mirror, create target repositories empty, without README, license, or `.gitignore`.

## HA Docker Cleaner

Use this when Docker images, stopped containers, or build cache slowly consume disk space on Home Assistant OS / Supervised installs.

Highlights:

- Weekly scheduled cleanup
- Optional startup cleanup with delay
- Dry-run mode
- Optional age filter with `prune_until`
- Optional image, container, builder-cache, network, and volume pruning
- Conservative defaults: volume and network pruning are disabled
- Home Assistant, ntfy, and Gotify notifications

Recommended defaults:

```yaml
prune_images: true
prune_containers: true
prune_builder: false
prune_volumes: false
prune_networks: false
```

Only enable volume pruning if you understand the risk and have recent backups.

## Compatibility

These add-ons are intended for Home Assistant installations that support add-ons:

- Home Assistant OS
- Home Assistant Supervised

They are not intended for Home Assistant Container without Supervisor or Home Assistant Core Python virtualenv installations.

## Troubleshooting Repository Setup

If Home Assistant says this is not a valid add-on repository, verify these files exist in the GitHub repository root:

- `repository.yaml`
- `invoice-portal/config.yaml`
- `git-mirror/config.yaml`
- `ha-docker-cleaner/config.yaml`

Each add-on directory must contain normal multi-line YAML in `config.yaml`, not a collapsed one-line file.

## Security Notes

- Change default passwords before exposing any add-on outside Home Assistant ingress.
- Store Git and notification tokens with the least permissions required.
- Keep Home Assistant backups before enabling aggressive Docker cleanup options.
- Review each add-on README before enabling options that can delete data or push to external services.
