#!/bin/sh
set -eu
# The application deliberately gives sendmail a minimal, trusted PATH.
# Keep the file path fixed: SMTP credentials are not inherited by child processes.
exec msmtp --file=/tmp/signalpost-mail/msmtprc "$@"
