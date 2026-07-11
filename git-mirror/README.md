# Git Repository Mirror

Mirror Git repositories between GitHub, GitLab, Gitea, Forgejo, and other Git hosts from inside Home Assistant.

This add-on is useful when you want your Home Assistant server to keep backup mirrors of repositories in a self-hosted GitLab, Gitea, or Forgejo instance.

## Features

- Mirror multiple repositories from one add-on
- Configure repositories from the Home Assistant add-on UI
- Supports public and private Git repositories over HTTPS
- Provider-aware HTTP token injection for GitHub, GitLab, Gitea, and Forgejo
- Global provider defaults with per-repository overrides
- Per-repository mirror mode overrides
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
| `mirror` | Full mirror push. Requires force-push permission on protected branches. |

For most users, use `heads-tags`.

## Basic configuration

```yaml
sync_interval: 3600
run_on_start: true
mirror_mode: heads-tags
source_provider: github
target_provider: gitlab
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
> `enabled` is optional and defaults to `true`. Empty or incomplete repo rows are ignored until `name`, `source`, and `target` are filled in.

## Provider targets

Set `target_provider` to `gitlab`, `gitea`, `forgejo`, `github`, or `custom`.

For self-hosted Forgejo or Gitea, still choose `forgejo` or `gitea` as the provider. Use `custom` only when you want to provide generic `target_username` and `target_token` credentials.

GitLab example:

```yaml
target_provider: gitlab
gitlab_username: oauth2
gitlab_token: YOUR_GITLAB_TOKEN
```

Gitea example:

```yaml
target_provider: gitea
gitea_username: your-gitea-user
gitea_token: YOUR_GITEA_TOKEN
```

Forgejo example:

```yaml
target_provider: forgejo
forgejo_username: your-forgejo-user
forgejo_token: YOUR_FORGEJO_TOKEN
```

You can override the target provider per repository:

```yaml
repos:
  - name: HA-Addons-GitLab
    source: https://github.com/tomtomdk/ha-addons.git
    target: https://gitlab.example.com/tomtom/ha-addons.git
    target_provider: gitlab

  - name: HA-Addons-Forgejo
    source: https://github.com/tomtomdk/ha-addons.git
    target: https://forgejo.example.com/tomtom/ha-addons.git
    target_provider: forgejo
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

### Gitea and Forgejo

Create an access token for the user that can push to the target repository and set the matching provider username and token.

## Important

This add-on does not create target repositories automatically. Create the target repository first.

For the cleanest mirror, create the target repository as an empty repository without README, license, or `.gitignore`.

See `DOCS.md` for troubleshooting common mirror errors.
