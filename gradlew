#!/bin/sh
# Minimal Gradle Wrapper launcher for Dolary.
APP_HOME=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
if [ -n "${JAVA_HOME:-}" ]; then
    JAVA_EXE="$JAVA_HOME/bin/java"
else
    JAVA_EXE="java"
fi
CLASSPATH="$APP_HOME/gradle/wrapper/gradle-wrapper.jar"
exec "$JAVA_EXE" ${JAVA_OPTS:-} ${GRADLE_OPTS:-} -classpath "$CLASSPATH" org.gradle.wrapper.GradleWrapperMain "$@"
