#!/bin/sh
# Sourced by the entrypoint; the path argument keeps configuration IO testable.
configure_msmtp() (
    set -eu
    umask 077
    config_directory=$1
    if [ -L "$config_directory" ]; then
        printf '%s\n' 'Refusing a symlink for the private mail directory.' >&2
        exit 78
    fi
    mkdir -p "$config_directory"
    chmod 700 "$config_directory"
    config_file=$config_directory/msmtprc
    # Remove stale credentials on restart, including when mail is now disabled.
    rm -f "$config_file"
    if [ -n "${SIGNALPOST_MSMTP_CONFIG:-}" ]; then
        printf '%s\n' "$SIGNALPOST_MSMTP_CONFIG" > "$config_file"
        chmod 600 "$config_file"
    fi
)
