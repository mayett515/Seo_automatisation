# Docker Desktop on Windows: AF_UNIX socket recovery and PostgreSQL test continuity

Date: 2026-08-25

## Question

Are recurring Docker Desktop startup failures around inaccessible entries below
`%LOCALAPPDATA%\Docker\run` an understood Windows socket problem, and what is a
safe recovery and integration-test strategy for this repository?

## Verdict

There are useful Docker/WSL best practices, but they do not amount to an
official stale-socket repair procedure. The incident explanation has a solid
technical core and then overstates the evidence:

- Windows pathname-bound AF_UNIX sockets really are represented by custom NTFS
  reparse points and serviced by the kernel's `afunix.sys` driver.
- `0 bytes` plus the `ReparsePoint` attribute is therefore the normal filesystem
  representation of such a socket, not by itself proof of a stale or corrupted
  "socket corpse."
- The exact Docker error (`listening on ...: remove ...: The file cannot be
accessed by the system`) and the directory-rename workaround are present in
  open reports in Docker's official issue tracker. Those reports are strong
  incident corroboration, but their root-cause explanations are reporter-authored,
  not a Docker-maintainer postmortem or supported recovery guide.
- A native/user-space PostgreSQL 17 runtime is a reasonable local continuity
  path for this repository. It bypasses Docker for database tests; it does not
  repair Docker and should not replace the containerized CI gate.

## Claim audit

| Claim                                                                             | Assessment                                                    | Evidence and correction                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker's host sockets under `Docker\run` can be NTFS reparse points               | **Verified in principle**                                     | Microsoft documents that a Windows AF_UNIX `bind` creates a custom NTFS reparse point and that most of the implementation lives in `afunix.sys`. [Microsoft: AF_UNIX comes to Windows](https://devblogs.microsoft.com/commandline/af_unix-comes-to-windows/)                                                                                                                                                                                                                                        |
| A zero-byte reparse point is a dead socket                                        | **Unsupported from metadata alone**                           | The reparse point is the normal pathname representation of a live AF_UNIX socket. Staleness requires additional evidence: the owning process is gone, the supported shutdown completed, the path predates the new start, and the backend log shows that the exact path cannot be removed or rebound.                                                                                                                                                                                                |
| The files are "shells pointing to kernel endpoints"                               | **Imprecise**                                                 | Safer wording: "filesystem representations of pathname-bound AF_UNIX sockets, serviced by `afunix.sys`." Microsoft does not describe them as endpoint shells.                                                                                                                                                                                                                                                                                                                                       |
| An unclean Docker shutdown can leave an inaccessible socket that prevents startup | **Plausible and repeatedly reported, not vendor-root-caused** | Docker's official feedback tracker contains current Windows reports with `ERROR_CANT_ACCESS_FILE`/error 1920, diagnostics IDs, and the same paths. They remain open issue reports rather than a published root-cause analysis. [Docker issue #531](https://github.com/docker/desktop-feedback/issues/531), [Docker issue #532](https://github.com/docker/desktop-feedback/issues/532)                                                                                                               |
| Docker performs `remove()` and then `listen()` and crashes                        | **Observed outcome; exact implementation unverified**         | The reported backend error proves that listener initialization attempted removal and aborted when removal failed. Docker Desktop's backend implementation is not established by the available public source, so the precise internal call sequence should not be stated as source-proven. Microsoft does document deletion before rebinding as the expected AF_UNIX lifecycle. [Microsoft AF_UNIX](https://devblogs.microsoft.com/commandline/af_unix-comes-to-windows/)                            |
| Renaming `Docker\run` is the proper fix                                           | **Incident workaround, not official best practice**           | It is reported in Docker's tracker and can quarantine an inaccessible pathname so Docker can create a new directory. It may also fail or merely expose the next socket. Preserve the renamed directory for forensics; do not turn repeated directory surgery into the normal startup path. [Docker issue #532](https://github.com/docker/desktop-feedback/issues/532)                                                                                                                               |
| A Windows reboot reliably clears the state                                        | **Unsupported as a guarantee**                                | A reboot is a reasonable broad reset, but neither Microsoft nor Docker promises that it repairs this exact state; at least one current issue report says the problem survived reboot. Microsoft's supported targeted reset is `wsl --shutdown`, which terminates all distributions and the WSL 2 utility VM. [Microsoft WSL commands](https://learn.microsoft.com/en-us/windows/wsl/basic-commands), [Microsoft WSL troubleshooting](https://learn.microsoft.com/en-us/windows/wsl/troubleshooting) |
| Factory reset deletes local Docker state and is the next normal step              | **Destructive last resort**                                   | Docker exposes Restart, Clean up data, and Reset to factory defaults, and separately documents backing up the Docker Desktop VM disk before reinstall/reset when Desktop cannot start. Use diagnosis and backup first. [Docker troubleshooting](https://docs.docker.com/desktop/troubleshoot-and-support/troubleshoot/), [Docker backup and restore](https://docs.docker.com/desktop/settings-and-maintenance/backup-and-restore/)                                                                  |
| The PostgreSQL ZIP is an official no-installer option                             | **Verified with a nuance**                                    | PostgreSQL.org links a ZIP archive for advanced Windows users, but states that the Windows downloads are hosted/certified by EDB rather than the PostgreSQL community servers. [PostgreSQL Windows downloads](https://www.postgresql.org/download/windows/)                                                                                                                                                                                                                                         |

## Safe recovery ladder

The goal is to preserve evidence and data while escalating from supported,
reversible actions to destructive ones.

1. **Do not race shutdown or force-kill the backend.** Use the supported
   `docker desktop stop` command and let it wait synchronously; use
   `docker desktop status` before starting again. Reserve `--force` for an
   already failed graceful stop. Docker documents the CLI lifecycle commands
   and their timeout behavior. [Stop](https://docs.docker.com/reference/cli/docker/desktop/stop/),
   [status](https://docs.docker.com/reference/cli/docker/desktop/status/),
   [start](https://docs.docker.com/reference/cli/docker/desktop/start/)
2. **Capture evidence before moving files or resetting anything.** Gather
   `docker desktop diagnose` (or `com.docker.diagnose` when the UI cannot start),
   retain the diagnostics ID, and preserve the host/backend logs. Docker
   documents `%LOCALAPPDATA%\Docker\log\vm\init.log` for WSL2 daemon logs.
   [Docker troubleshooting](https://docs.docker.com/desktop/troubleshoot-and-support/troubleshoot/),
   [daemon logs](https://docs.docker.com/engine/daemon/logs/)
3. **Check versions and supported prerequisites.** Docker requires WSL 2.1.5
   at minimum and recommends the latest WSL release. Run the supported WSL
   status/version checks, then update WSL and Docker Desktop. Do not claim an
   update is the specific socket fix: Docker Desktop 4.88.1 is current on this
   date, but its release notes do not identify this exact stale-host-socket
   failure as fixed. [Docker WSL best practices](https://docs.docker.com/desktop/features/wsl/best-practices/),
   [Docker release notes](https://docs.docker.com/desktop/release-notes/)
4. **Reset the WSL layer once.** After Docker Desktop is stopped, run
   `wsl --shutdown`, then start Docker Desktop once and observe status/logs.
   Microsoft documents this as terminating all WSL distributions and the WSL2
   utility VM. It is a supported reset, not proof that a host AF_UNIX reparse
   point will be repaired. [Microsoft WSL commands](https://learn.microsoft.com/en-us/windows/wsl/basic-commands)
5. **If the exact error 1920 persists, treat rename as a targeted forensic
   workaround.** Only with Docker and WSL fully stopped, verify the exact
   directory below the current user's local Docker data, rename that narrow
   parent, and preserve it. This is evidence from Docker's issue tracker, not a
   supported Docker procedure. Do not recursively delete reparse-point trees,
   modify ACLs, run `fsutil` experiments, or unregister WSL distributions as a
   generic cleanup step.
6. **Escalate with diagnostics.** A recurring failure that immediately creates
   another inaccessible socket after a clean directory is not ordinary stale
   pathname cleanup. File the diagnostic ID and exact Docker/Windows/WSL
   versions with Docker support or the official feedback tracker. Also check
   security/backup software only from evidence; Docker documents that antivirus
   can cause Windows startup conflicts, but that does not prove it caused this
   incident. [Docker Windows troubleshooting topics](https://docs.docker.com/desktop/troubleshoot-and-support/troubleshoot/topics/)
7. **Back up before destructive recovery.** If images/volumes matter and Desktop
   cannot launch, Docker documents an offline backup of the Docker Desktop VM
   disk. Only after backup consider Clean up data, factory reset, repair, or
   reinstall. Uninstall explicitly destroys local containers, images, volumes,
   and related data. [Backup and restore](https://docs.docker.com/desktop/settings-and-maintenance/backup-and-restore/),
   [uninstall](https://docs.docker.com/desktop/uninstall/)

`wsl --unregister` is not a casual repair command: Microsoft documents that it
permanently removes the selected distribution's data. It should not appear in
an automated Docker recovery script. [Microsoft WSL commands](https://learn.microsoft.com/en-us/windows/wsl/basic-commands)

## Integration-test architecture for this repository

The repository already has the right abstraction. The integration harness takes
`TEST_DATABASE_URL`, refuses an ordinary database name, drops/recreates the
`public` schema, applies the real migrations, and does not care whether the
PostgreSQL server came from Docker, a native process, or CI:

- `packages/db/test-support/integration-database.ts`
- `docs/testing/lifecycle-integration-coverage.md`
- `.github/workflows/ci.yml` pins the authoritative service to `postgres:17`

Recommended policy:

1. **Keep CI on containerized PostgreSQL 17.** It is disposable, reproducible,
   and already the merge gate.
2. **Use a demand-started, user-space PostgreSQL 17 instance as the local
   continuity provider on this machine.** Give it a dedicated data directory,
   dedicated port (for example 5433), and a database whose name contains
   `test` or `integration`. Start and stop it with `pg_ctl`; PostgreSQL documents
   `pg_ctl` as the supported process controller and warns that immediate stop
   causes crash recovery on the next start. [PostgreSQL `pg_ctl`](https://www.postgresql.org/docs/17/app-pg-ctl.html)
3. **Do not install it as an always-on production-like Windows service merely
   for tests.** A per-user, demand-started process is a smaller ownership and
   cleanup surface. This is a project recommendation, not a PostgreSQL product
   requirement.
4. **Pin the local major version to CI (`17`).** "Any PostgreSQL" is sufficient
   for connectivity but not for confidence in migrations, collations, triggers,
   or concurrency behavior.
5. **Keep the connection URL session-local.** Point `TEST_DATABASE_URL` only at
   the disposable database; do not reuse a development or remote shared
   database. The current harness's destructive reset makes a generic cloud
   database a poor default.
6. **Automate lifecycle only if the fallback becomes routine.** A small
   repository script may own `status -> start -> test -> stop` for the dedicated
   cluster. It should not silently download binaries, create global environment
   variables, or fall back to another database after a failed connection.

PostgreSQL's `initdb` initializes an isolated cluster, while `pg_ctl` provides
controlled start/status/stop behavior. [PostgreSQL `initdb`](https://www.postgresql.org/docs/17/app-initdb.html),
[PostgreSQL `pg_ctl`](https://www.postgresql.org/docs/17/app-pg-ctl.html)

## Practical conclusion

Do not choose between "keep fighting Docker forever" and "factory reset now."
Use two separate decisions:

- **Docker health:** follow the supported lifecycle, diagnostics, WSL reset,
  update, backup, and support escalation ladder. Treat directory rename as a
  narrow, unsupported incident workaround.
- **Test continuity:** use a disposable local PostgreSQL 17 process through the
  existing `TEST_DATABASE_URL` seam, while preserving the containerized CI
  integration gate.

This removes Docker Desktop from the critical path for today's database proof
without pretending that native PostgreSQL fixes the Docker/Windows failure.
