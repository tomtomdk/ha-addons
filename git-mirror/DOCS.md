# Git Repository Mirror Documentation

## First setup

1. Create the target repository in GitLab.
2. Do not initialize it with a README, license, or `.gitignore`.
3. Create a GitLab token with `write_repository` scope.
4. Add your repositories in the add-on configuration.
5. Start the add-on.
6. Check the add-on logs.

## Example configuration

```yaml
sync_interval: 3600
run_on_start: true
mirror_mode: heads-tags
github_username: tomtomdk
github_token: ""
gitlab_username: oauth2
gitlab_token: glpat-xxxxxxxxxxxxxxxxxxxx
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
> `enabled` is optional and defaults to `true`. Use the YAML editor if the form view gives validation issues with repo lists.


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

Use this only if you want refs deleted from GitHub to also be deleted from GitLab.

### `mirror`

Runs:

```bash
git push --mirror
```

This is the most exact mirror mode, but it may force-update or delete refs. GitLab protected branches usually block this unless force-push is allowed.

## Troubleshooting

### `HTTP Basic: Access denied`

Authentication to GitLab failed.

Check:

- `gitlab_token` is correct
- token is not expired
- token has `write_repository`
- token user has access to the GitLab project
- `gitlab_username` is correct

For a personal access token, this usually works:

```yaml
gitlab_username: oauth2
```

For a project access token, GitLab may require the generated project bot username.

### `You are not allowed to force push code to a protected branch`

You are using `mirror` mode and GitLab protected branches are blocking force-push.

Recommended fix:

```yaml
mirror_mode: heads-tags
```

Alternative: allow force-push on the protected branch in GitLab, but only if the repository is purely a mirror.

### `main -> main (fetch first)`

GitLab already contains commits that are not in GitHub.

Most common cause: the GitLab repository was initialized with a README, license, or `.gitignore`.

Best fix:

1. Delete the GitLab target repository.
2. Recreate it as empty.
3. Restart this add-on.

Alternative: temporarily use a force-push capable mode, but this requires changing GitLab branch protection.

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
- Use a dedicated GitLab token with only the access required.

## Cache location

Bare repositories are stored inside the add-on data directory:

```text
/data/repos
```

This survives add-on restarts and updates.
