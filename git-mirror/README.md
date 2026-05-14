# Git Repository Mirror

Mirror Git repositories from GitHub or other Git hosts to GitLab from inside Home Assistant.

This add-on is useful when you want your Home Assistant server to keep backup mirrors of your GitHub repositories in a self-hosted GitLab instance.

## Features

- Mirror multiple repositories from one add-on
- Configure repositories from the Home Assistant add-on UI
- Supports public and private GitHub repositories
- Supports GitLab personal, project, or deploy-style tokens
- Persistent bare repository cache under `/data/repos`
- Safe default mode that does not force-push
- Optional Home Assistant persistent notifications
- Optional ntfy, Gotify, and Discord webhook notifications
- Works on amd64, aarch64, armv7, armhf, and i386

## Recommended mirror mode

Default mode:

```yaml
mirror_mode: heads-tags
```

This pushes branches and tags without force-pushing or pruning deleted refs.

Available modes:

| Mode | Description |
|---|---|
| `heads-tags` | Safest. Pushes branches and tags. Does not delete remote refs. |
| `heads-tags-prune` | Pushes branches and tags and prunes deleted upstream refs. |
| `mirror` | Full mirror push. Requires force-push permission on protected GitLab branches. |

For most users, use `heads-tags`.

## Basic configuration

```yaml
sync_interval: 3600
run_on_start: true
mirror_mode: heads-tags
github_username: tomtomdk
github_token: ""
gitlab_username: oauth2
gitlab_token: YOUR_GITLAB_TOKEN
notify_on_success: false
notify_on_failure: true
ha_notifications: true

repos:
  - name: HA-Addons
    source: https://github.com/tomtomdk/ha-addons.git
    target: https://git.ttdk.eu/tomtom/ha-addons.git
    enabled: true
```

## Token permissions

### GitHub

For public GitHub repositories, no GitHub token is required.

For private GitHub repositories, use a GitHub token with repository read access.

### GitLab

The GitLab token needs permission to push to the target repository.

Recommended GitLab scope:

```text
write_repository
```

The token user must also have access to the target project.

## Important

This add-on does not create GitLab repositories automatically. Create the target GitLab repository first.

For the cleanest mirror, create the GitLab repository as an empty repository without README, license, or `.gitignore`.

See `DOCS.md` for troubleshooting common GitLab mirror errors.
