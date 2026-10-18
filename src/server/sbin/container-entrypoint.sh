#!/bin/sh
set -eu
umask 077
. "$(dirname "$0")/msmtp-config.sh"
configure_msmtp /tmp/signalpost-mail
unset SIGNALPOST_MSMTP_CONFIG
# No shell or package manager between the orchestrator and Node's signal handler.
exec "$@"
