# Licensing

JLFBot is licensed under the [Apache License 2.0](LICENSE).

It is a modified fork of an Apache-2.0 project; the original copyright and
attribution are kept in [NOTICE](NOTICE), which also records that JLFBot is a
modified version. Keep both files when redistributing.

The upstream source-available `enterprise/` directory (under a separate,
non-Apache license) is **not** included in JLFBot, and nothing in this
repository depends on it: the server always reports the open-source edition
(`{"edition":"oss"}`). The `open-source edition builds without enterprise/` CI
job checks that boot path on every change.

Third-party code vendored under `third_party/` keeps its own license files.
