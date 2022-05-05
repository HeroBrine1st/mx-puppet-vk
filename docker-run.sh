#!/bin/sh -e

if [ ! -f "$CONFIG_PATH" ]; then
	echo "No config file found, creating sample config"
	cp /opt/mx-puppet-vk/sample.config.yaml $CONFIG_PATH
	echo "Stop this container right now (seriously), edit config and start again."
	exit 1
fi

cmp --silent /opt/mx-puppet-vk/sample.config.yaml $CONFIG_PATH || (echo "Config file is the sample file, ignoring" && exit 1)

args="$@"

if [ ! -f "$REGISTRATION_PATH" ]; then
	echo 'No registration found, generating now'
	args="-r"
fi

user="${USER:-1000}:${GROUP:-${USER:-1000}}"

# If running as root, prepare files to drop privileges
if [ "$(id -u)" = 0 ]; then
	# Should it chown [change owner] of whole volume?
	# chown -R $user /data

	# Another question: should it chown in principle? Or chowning is deployer's task?

	chown $user /data

	if find *.db > /dev/null 2>&1; then
		# make sure sqlite files are writeable
		chown $user *.db
	fi
	if find *.log.* > /dev/null 2>&1; then
		# make sure log files are writeable
		chown $user *.log.*
	fi

	su_exec='su-exec $user'
else
	su_exec=''
fi

# $su_exec is used in case we have to drop the privileges
exec $su_exec /usr/local/bin/node '/opt/mx-puppet-vk/build/index.js' \
     -c "$CONFIG_PATH" \
     -f "$REGISTRATION_PATH" \
     $args
