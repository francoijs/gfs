#!/bin/sh

export JSDOCDIR=/opt/jsdoc-toolkit/
export JSDOCTEMPLATEDIR=$JSDOCDIR/templates/jsdoc/
$JSDOCDIR/jsrun.sh -r -d=doc  ./src/$1

