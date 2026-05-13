# HA Docker Cleaner

A lightweight Home Assistant add-on that helps keep your Home Assistant OS / Supervisor installation clean by automatically pruning unused Docker resources.

This add-on is useful for systems where old add-on images, stopped containers, or Docker build cache slowly eat up disk space over time.

---

## Features

- Automatically cleans unused Docker images
- Removes stopped containers
- Optional Docker builder cache cleanup
- Optional unused volume cleanup
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