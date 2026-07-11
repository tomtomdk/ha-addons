# Git Repository Mirror Documentation

## First setup

1. Create the target repository in GitLab, Gitea, Forgejo, or another Git host.
2. Do not initialize it with a README, license, or `.gitignore`.
3. Create a token for the target provider with push access.
4. Add your repositories in the add-on configuration.
5. Start the add-on.
6. Check the add-on logs.

## Example configuration

```yaml
sync_interval: 3600
run_on_start: true
mirror_mode: heads-tags
source_provider: github
source_username: ""
source_token: ""
target_provider: gitlab
target_username: ""
target_token: ""
github_username: tomtomdk
github_token: ""
gitlab_username: oauth2
gitlab_token: glpat-xxxxxxxxxxxxxxxxxxxx
gitea_username: ""
gitea_token: ""
forgejo_username: ""
forgejo_token: ""
notify_on_success: false
notify_on_failure: true
ha_notifications: true
ntfy_enabled: false
ntfy_url: https://ntfy.sh
ntfy_topic: ""
ntfy_token: ""
gotify_enabled: false
gotify_url: ""
gotify_token: ""
discord_enabled: false
discord_webhook_url: ""

repos:
  - name: HA-Addons
    source: https://github.com/tomtomdk/ha-addons.git
    target: https://git.ttdk.eu/tomtom/ha-addons.git
    enabled: true
```
> `enabled` is optional and defaults to `true`. Empty or incomplete repo rows are ignored until `name`, `source`, and `target` are filled in.

## Providers and credentials

Supported provider values:

| Provider | Typical use |
|---|---|
| `github` | GitHub source or target repositories. |
| `gitlab` | GitLab source or target repositories. |
| `gitea` | Gitea source or target repositories. |
| `forgejo` | Forgejo source or target repositories. |
| `custom` | Any HTTP(S) Git server where you provide `source_username`/`source_token` or `target_username`/`target_token`. |

For self-hosted Forgejo or Gitea, still choose `forgejo` or `gitea` as the provider. Use `custom` only when you want to provide generic `source_*` or `target_*` credentials.

Credential precedence for each repository:

1. Per-repository `source_username`, `source_token`, `target_username`, or `target_token`.
2. Generic `source_username`/`source_token` or `target_username`/`target_token`.
3. Provider-specific options such as `gitlab_token`, `gitea_token`, or `forgejo_token`.

`github_username`, `github_token`, `gitlab_username`, and `gitlab_token` are still supported for existing configurations.

### GitLab target

```yaml
target_provider: gitlab
gitlab_username: oauth2
gitlab_token: glpat-xxxxxxxxxxxxxxxxxxxx
```

### Gitea target

```yaml
target_provider: gitea
gitea_username: your-gitea-user
gitea_token: YOUR_GITEA_TOKEN
```

### Forgejo target

```yaml
target_provider: forgejo
forgejo_username: your-forgejo-user
forgejo_token: YOUR_FORGEJO_TOKEN
```

### Mixed targets

You can mirror different repositories to different providers from one add-on instance:

```yaml
repos:
  - name: Project-To-GitLab
    source: https://github.com/example/project.git
    target: https://gitlab.example.com/mirrors/project.git
    target_provider: gitlab

  - name: Project-To-Gitea
    source: https://github.com/example/project.git
    target: https://gitea.example.com/mirrors/project.git
    target_provider: gitea

  - name: Project-To-Forgejo
    source: https://github.com/example/project.git
    target: https://forgejo.example.com/mirrors/project.git
    target_provider: forgejo
```

Each repository can also override `mirror_mode`:

```yaml
repos:
  - name: Safe-Mirror
    source: https://github.com/example/safe.git
    target: https://gitlab.example.com/mirrors/safe.git
    target_provider: gitlab
    mirror_mode: heads-tags

  - name: Exact-Mirror
    source: https://github.com/example/exact.git
    target: https://forgejo.example.com/mirrors/exact.git
    target_provider: forgejo
    mirror_mode: mirror
```


## Mirror modes

### `heads-tags`

Safe default mode.

It runs:

```bash
git push origin "refs/heads/*:refs/heads/*"
git push origin "refs/tags/*:refs/tags/*"
```

This does not intentionally force-push or prune refs.

### `heads-tags-prune`

Same as `heads-tags`, but with `--prune`.

Use this only if you want refs deleted from the source to also be deleted from the target.

### `mirror`

Runs:

```bash
git push --mirror
```

This is the most exact mirror mode, but it may force-update or delete refs. Protected branches usually block this unless force-push is allowed.

## Troubleshooting

### `HTTP Basic: Access denied`

Authentication to the target provider failed.

Check:

- the provider token is correct
- token is not expired
- token has push access to the target repository
- token user has access to the target repository
- the provider username is correct

For a personal access token, this usually works:

```yaml
gitlab_username: oauth2
```

For a project access token, GitLab may require the generated project bot username.

For Gitea or Forgejo, set the actual user name that owns the token:

```yaml
gitea_username: your-user
gitea_token: YOUR_TOKEN
```

or:

```yaml
forgejo_username: your-user
forgejo_token: YOUR_TOKEN
```

### `You are not allowed to force push code to a protected branch`

You are using `mirror` mode and protected branches are blocking force-push.

Recommended fix:

```yaml
mirror_mode: heads-tags
```

Alternative: allow force-push on the protected branch in the target provider, but only if the repository is purely a mirror.

### `main -> main (fetch first)`

The target already contains commits that are not in the source.

Most common cause: the target repository was initialized with a README, license, or `.gitignore`.

Best fix:

1. Delete the target repository.
2. Recreate it as empty.
3. Restart this add-on.

Alternative: temporarily use a force-push capable mode, but this requires changing branch protection on the target provider.

### `fatal: --mirror can't be combined with refspecs`

This happens when an old cached repository was originally cloned with `git clone --mirror` and still has `remote.origin.mirror=true` in its Git config.

This add-on automatically removes that setting during sync.

If it still happens, delete the cached repo folder under `/data/repos` by uninstalling/reinstalling the add-on or removing the stale cache manually from the add-on container.

## Notifications

### Home Assistant persistent notifications

Enable:

```yaml
ha_notifications: true
notify_on_failure: true
```

The add-on uses the Home Assistant Core API through `http://supervisor/core/api/` with `SUPERVISOR_TOKEN`.

### ntfy

Example:

```yaml
ntfy_enabled: true
ntfy_url: https://ntfy.sh
ntfy_topic: my-git-mirror-topic
ntfy_token: ""
```

### Gotify

Example:

```yaml
gotify_enabled: true
gotify_url: https://gotify.example.com
gotify_token: YOUR_GOTIFY_APP_TOKEN
```

### Discord webhook

Example:

```yaml
discord_enabled: true
discord_webhook_url: https://discord.com/api/webhooks/...
```

## Security notes

- Tokens are stored in the Home Assistant add-on configuration.
- Avoid posting logs that contain manually tested tokenized URLs.
- The add-on avoids printing authenticated Git URLs in normal logs.
- Use dedicated provider tokens with only the access required.

## Cache location

Bare repositories are stored inside the add-on data directory:

```text
/data/repos
```

This survives add-on restarts and updates.
