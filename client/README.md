# JB Search — Client Support

The JB Search client component for Remote SSH, WSL, and Dev Containers runs in
the UI extension host. It supplies the active theme and TextMate grammars to the
main extension through VS Code commands. Search queries and file contents are
not sent to this component.

The main JB Search extension normally installs it from the bundled VSIX. It
requires no separate application, network service, authentication, or palette
setup. It performs no searches and provides no standalone window.

For development, register this folder once **on the client** through
Developer: Install Extension from Location, then use Reload Window. Register
the main JB Search folder on the server. See the main repository's README for
details.
