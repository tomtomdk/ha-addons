# HA Docker Cleaner

A lightweight Home Assistant add-on that helps keep your Home Assistant OS / Supervisor installation clean by automatically pruning unused Docker resources.

This add-on is useful for systems where old add-on images, stopped containers, or Docker build cache slowly eat up disk space over time.

---

## Features

- Automatically cleans unused Docker images
- Removes stopped containers
- Optional Docker builder cache cleanup
- Optional unused volume cleanup
- Optional unused network cleanup
- Dry-run mode for testing cleanup settings
- Optional age filter to keep recently-created Docker resources
- Configurable weekly schedule
- Runs as a Home Assistant add-on
- Writes cleanup logs to `/share/ha-docker-cleaner.log`
- Designed for Home Assistant OS / Supervised installations

---

## Why this exists

Home Assistant add-ons are Docker containers. Over time, updates and old add-ons can leave behind unused Docker images, stopped containers, cache data, and dangling volumes.

On devices with limited storage, this can eventually cause the system disk to fill up.

`HA Docker Cleaner` provides a simple scheduled cleanup process so you do not have to manually run commands like:

```bash
docker image prune -af
docker container prune -f
docker builder prune -af
docker network prune -f
```

---

## What it cleans

By default, the add-on cleans:

| Resource type | Default | Description |
|---|---:|---|
| Unused Docker images | Enabled | Removes images not used by running containers |
| Stopped containers | Enabled | Removes containers that are no longer running |
| Builder cache | Disabled | Removes Docker build cache |
| Unused volumes | Disabled | Removes dangling Docker volumes |
| Unused networks | Disabled | Removes Docker networks not used by containers |

---

## Safety notes

The default configuration is intentionally conservative.

The add-on does **not** prune Docker volumes by default.

Docker volumes may contain data from old or removed add-ons. While Docker marks dangling volumes as unused, deleting them can still remove data you may want later.

Only enable volume pruning if you understand the risk.

```yaml
prune_volumes: false
```

Recommended default:

```yaml
dry_run: false
prune_until: ""
prune_images: true
prune_containers: true
prune_builder: false
prune_volumes: false
prune_networks: false
```

To test a configuration without deleting anything:

```yaml
dry_run: true
```

To keep recently-created resources, set an age filter:

```yaml
prune_until: 168h
```

The age filter is applied to image, container, builder-cache, and network pruning. Docker volume pruning does not support this filter.

---

## Installation

### Add this repository to Home Assistant

1. Open Home Assistant
2. Go to **Settings**
3. Open **Add-ons**
4. Open the **Add-on Store**
5. Click the three-dot menu in the top right
6. Choose **Repositories**
7. Add this repository URL:

```text
https://github.com/tomtomdk/ha-addons
```

8. Click **Add**
9. Refresh the Add-on Store
10. Install **HA Docker Cleaner**

---

## Configuration

Example configuration:

```yaml
run_day: sun
run_hour: 4
dry_run: false
prune_until: ""
prune_images: true
prune_containers: true
prune_builder: false
prune_volumes: false
prune_networks: false
log_max_lines: 500
```

### Options

| Option | Type | Default | Description |
|---|---|---:|---|
| `run_day` | list | `sun` | Day of the week to run cleanup |
| `run_hour` | integer | `4` | Hour of the day to run cleanup, using 24-hour format |
| `run_on_start` | boolean | `false` | Run cleanup when the add-on starts |
| `run_on_start_delay` | integer | `900` | Seconds to wait before startup cleanup |
| `dry_run` | boolean | `false` | Log cleanup commands without deleting anything |
| `prune_until` | string | empty | Optional Docker `until` filter, for example `24h` or `168h` |
| `prune_images` | boolean | `true` | Remove unused Docker images |
| `prune_containers` | boolean | `true` | Remove stopped containers |
| `prune_builder` | boolean | `false` | Remove Docker build cache |
| `prune_volumes` | boolean | `false` | Remove unused Docker volumes |
| `prune_networks` | boolean | `false` | Remove unused Docker networks |
| `log_max_lines` | integer | `500` | Number of recent log lines to keep |

Supported values for `run_day`:

```text
mon, tue, wed, thu, fri, sat, sun
```

Supported values for `run_hour`:

```text
0-23
```

---

## Recommended schedule

A weekly cleanup is usually enough.

Recommended:

```yaml
run_day: sun
run_hour: 4
```

This runs every Sunday at 04:00.

---

## Logs

Cleanup logs are written to:

```text
/share/ha-docker-cleaner.log
```

You can view the log from the Terminal add-on:

```bash
tail -100 /share/ha-docker-cleaner.log
```

The log includes:

- Cleanup start time
- Disk usage before cleanup
- Docker usage before cleanup
- Cleanup actions performed
- Exact Docker commands used
- Disk usage after cleanup
- Docker usage after cleanup

---

## Manual Docker checks

You can manually check Docker disk usage from a terminal with Docker access:

```bash
docker system df
```

Example output:

```text
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          146       57        71.34GB   38.43GB (53%)
Containers      58        54        283.4MB   342.6kB (0%)
Local Volumes   435       6         11.26GB   11.26GB (100%)
Build Cache     2805      0         6.923GB   6.083GB
```

---

## Manual cleanup commands

The add-on automates these commands depending on your configuration:

```bash
docker image prune -af
docker container prune -f
docker builder prune -af
docker network prune -f
docker volume prune -f
```

Volume pruning is disabled by default because it can remove data from unused Docker volumes.

---

## Compatibility

This add-on is intended for Home Assistant installations that use Supervisor and support add-ons.

It is designed for:

- Home Assistant OS
- Home Assistant Supervised

It is not intended for:

- Home Assistant Container without Supervisor
- Home Assistant Core Python virtualenv installs

Supported architectures depend on the add-on configuration and base image.

Common supported architectures:

```text
aarch64
amd64
armv7
armhf
i386
```

---

## Example use case

A Home Assistant system with a 228 GB NVMe became full because old Docker images, unused volumes, and builder cache accumulated over time.

After pruning unused Docker resources, disk usage dropped from nearly full to healthy free space again.

This add-on was created to prevent that kind of buildup from happening again.

---

## Troubleshooting

### The add-on fails to build

Make sure the Dockerfile uses the Home Assistant base image:

```dockerfile
FROM ghcr.io/home-assistant/base:latest
```

Older add-on examples may use:

```dockerfile
ARG BUILD_FROM
FROM ${BUILD_FROM}
```

On newer Supervisor versions, `BUILD_FROM` may not be passed automatically, which can cause this error:

```text
base name (${BUILD_FROM}) should not be blank
```

---

### Docker command not found

If you tried running cleanup through a Home Assistant `shell_command`, you may see:

```text
docker: not found
```

This happens because `shell_command` runs inside the Home Assistant Core container, which does not include the Docker CLI.

This add-on avoids that problem by running in its own container with Docker API access enabled.

---

### Disk space is still high after cleanup

Run:

```bash
docker system df
```

Then check which resource type is still using space.

If unused volumes are using a lot of space, you can enable:

```yaml
prune_volumes: true
```

Use this with care.

You should also check Home Assistant backups:

```bash
ls -lah /backup
```

Large `.tar` backup files can use a lot of space.

---

## Recommended defaults

For most users:

```yaml
run_day: sun
run_hour: 4
dry_run: false
prune_until: ""
prune_images: true
prune_containers: true
prune_builder: false
prune_volumes: false
prune_networks: false
```

For more aggressive cleanup:

```yaml
run_day: sun
run_hour: 4
prune_images: true
prune_containers: true
prune_builder: true
prune_volumes: false
prune_networks: true
prune_until: 168h
```

Only enable this if you understand what Docker volumes are:

```yaml
prune_volumes: true
```

---

## Disclaimer

This add-on performs Docker cleanup operations on your Home Assistant system.

The default settings avoid the riskiest cleanup operation, volume pruning, but you are still responsible for your backups and configuration.

Before enabling aggressive cleanup options, make sure you have a recent Home Assistant backup.

---

## License

MIT License

---

## Author

Created by TomTomDK.
