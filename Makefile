# AuraOS — build targets
# All targets that touch debootstrap/losetup need root.

.PHONY: build clean image-only help

## Full build: debootstrap → privacy layer → Lomiri → RPi packages → .img.xz
build:
	sudo bash build.sh

## Build with WiFi pre-configured (set SSID and PASS on the command line)
## Usage: make wifi SSID="MyNetwork" PASS="mypassword"
wifi:
	sudo bash build.sh --wifi "$(SSID):$(PASS)"

## Rebuild only the image from an existing rootfs (skips debootstrap + apt steps)
image-only:
	sudo bash 50-image-builder.sh

## Remove build artifacts (rootfs + output images)
clean:
	@echo "This will remove ./rootfs and ./out — are you sure? [y/N]"
	@read -r yn; [ "$$yn" = y ] || exit 0; \
	  sudo rm -rf rootfs/ out/ && echo "Cleaned."

## Show targets
help:
	@grep -E '^##' Makefile | sed 's/^## /  /'
