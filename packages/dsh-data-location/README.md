# dsh-data-location

English | [中文](README.zh.md)

## What it does

Move the Desktop data directory with rollback.

## Install

Open it in DeepSeek Harness Community Desktop, where it is built in.

## Config

Select an empty directory, run preflight and confirm the restart.

## Security model

The Desktop shell validates the target and retains the previous directory.

## Known limitations

An explicit DSH_HOME sets the directory to read-only in settings.
