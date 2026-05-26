# MSRC Last Attempt - Evidence Summary

Case context: Microsoft Entra ID / Microsoft 365 Admin Center session state confusion resulting in privileged action without MFA evidence for the privileged identity.

Prepared from: `C:\Users\XxGol\IdeaProjects\PrivEsc_Admin_Bypass.saz`

Sensitive values intentionally omitted: cookies, bearer tokens, Ajax session keys, and full token material.

## Core Claim

The issue is not TLS reuse by itself. The security issue is cross-identity authentication state confusion:

An administrative identity appears to receive Microsoft 365 Admin Center access and execute a privileged user deletion while the captured access-token evidence for that administrative identity shows password-only authentication (`amr:["pwd"]`), while a separate standard-user identity in the same browser context has an MFA-authenticated token (`amr:["pwd","mfa"]`).

## Key Identities Observed

Tenant ID:

`eb494ccc-bf56-4042-a6ec-fa190be4cbe1`

Administrative identity observed in Microsoft 365 admin/session APIs:

`joseluiscruz0001@ORSTEDCORP001.onmicrosoft.com`

Object ID:

`9ba60565-6116-488f-8cb6-babac925e09b`

Standard-user identity observed in the same browser capture:

`usuario.estandar@ORSTEDCORP001.onmicrosoft.com`

Object ID:

`696a8678-73a9-4a34-b121-87784a899a33`

## Evidence Timeline

All times below are UTC from response headers or Fiddler metadata.

| Time UTC | SAZ Session | Evidence |
|---|---:|---|
| 2025-11-30 15:50:10 | 0927 | `GET https://portal.office.com/admin/api/users/currentUser` returns `200 OK` for `joseluiscruz0001@ORSTEDCORP001.onmicrosoft.com`. Decoded bearer claims show `amr:["pwd"]`, no `mfa` value. |
| 2025-11-30 15:50:46 | 1251 | `GET https://admin.cloud.microsoft/admin/api/users/getuseraccesstoken?...` returns `200 OK`. |
| 2025-11-30 15:51:11 | 1585 | `POST https://admin.cloud.microsoft/admin/api/Users/ListUsers` returns `200 OK`. |
| 2025-11-30 15:51:12 | 1587 | `GET https://admin.cloud.microsoft/admin/api/users/getavailableroles` returns `200 OK`. |
| 2025-11-30 15:51:23 | 1601 | `GET https://admin.cloud.microsoft/admin/api/users/a94d7433-c42b-44d1-a147-86bfca4277b0` returns `200 OK`. |
| 2025-11-30 15:51:45 | 1631 | `PUT https://admin.cloud.microsoft/admin/api/users/setUserProducts?countryCode=&mode=2` returns `200 OK` for user object `a94d7433-c42b-44d1-a147-86bfca4277b0`. Response body references display name `Alfredo Cano` and UPN `Procesoscriticos@ORSTEDCORP001.onmicrosoft.com`. |
| 2025-11-30 15:51:46 | 1634 | `DELETE https://admin.cloud.microsoft/admin/api/users/delete` returns `200 OK` for user object `a94d7433-c42b-44d1-a147-86bfca4277b0`, UPN `Procesoscriticos@ORSTEDCORP001.onmicrosoft.com`. |
| 2025-11-30 15:51:46 | 1633 | A parallel `portal.azure.com` telemetry request carries a bearer token for `usuario.estandar@ORSTEDCORP001.onmicrosoft.com` with `amr:["pwd","mfa"]`. |
| 2025-11-30 15:54:39 | 3724 | `GET https://portal.office.com/admin/api/users/currentUser` again returns `200 OK` for `joseluiscruz0001@ORSTEDCORP001.onmicrosoft.com`. Decoded bearer claims again show `amr:["pwd"]`, no `mfa` value. |

## Important Token Claim Observations

Administrative identity token observed in sessions `0927` and `3724`:

```json
{
  "tid": "eb494ccc-bf56-4042-a6ec-fa190be4cbe1",
  "oid": "9ba60565-6116-488f-8cb6-babac925e09b",
  "upn": "joseluiscruz0001@ORSTEDCORP001.onmicrosoft.com",
  "name": "Jose Luis Cruz Prieto",
  "aud": "https://portal.office.com",
  "scp": "user_impersonation",
  "amr": ["pwd"],
  "acr": "1"
}
```

Standard-user identity token observed during the same period:

```json
{
  "tid": "eb494ccc-bf56-4042-a6ec-fa190be4cbe1",
  "oid": "696a8678-73a9-4a34-b121-87784a899a33",
  "upn": "usuario.estandar@ORSTEDCORP001.onmicrosoft.com",
  "name": "usuario.estandar",
  "aud": "c44b4083-3bb0-49c1-b47d-974e53cbdf3c",
  "amr": ["pwd", "mfa"],
  "acr": "1"
}
```

## Why This Should Be Reproduced Differently

The previous report may have been difficult to reproduce because it framed the root cause as TLS session reuse. TLS reuse is only a transport-level observation and may be expected browser behavior.

The reproducibility target should instead be:

1. Capture Entra sign-in logs for the admin identity.
2. Confirm Conditional Access / MFA was required for the admin identity.
3. Confirm no successful MFA event exists for the admin identity during the privileged access window.
4. Confirm Microsoft 365 Admin Center accepted privileged write operations during that same window.
5. Correlate with the Fiddler sessions listed above.

## Suggested MSRC Message

Hello MSRC team,

I am submitting this as a final clarification because the previous case was closed as not reproducible. I reviewed the attached Fiddler trace again and want to narrow the issue to the application-layer evidence, not TLS reuse.

The issue is cross-identity authentication state confusion in Microsoft Entra ID / Microsoft 365 Admin Center. In the attached trace, the administrative identity `joseluiscruz0001@ORSTEDCORP001.onmicrosoft.com` receives admin-session access and executes privileged Microsoft 365 Admin Center operations while the captured token evidence for that administrative identity shows password-only authentication (`amr:["pwd"]`) and does not show MFA (`mfa`) for that identity.

At the same time, the browser context also contains a standard-user identity, `usuario.estandar@ORSTEDCORP001.onmicrosoft.com`, with an MFA-authenticated token (`amr:["pwd","mfa"]`). This suggests that MFA/authentication state from the standard-user identity may be accepted while the privileged admin identity receives access.

Relevant sessions in `PrivEsc_Admin_Bypass.saz`:

- Session 0927, `2025-11-30T15:50:10Z`: `GET https://portal.office.com/admin/api/users/currentUser` returns `200 OK` for the admin identity. Decoded bearer claims show `amr:["pwd"]`, no `mfa`.
- Session 1587, `2025-11-30T15:51:12Z`: `GET https://admin.cloud.microsoft/admin/api/users/getavailableroles` returns `200 OK`.
- Session 1631, `2025-11-30T15:51:45Z`: `PUT https://admin.cloud.microsoft/admin/api/users/setUserProducts?countryCode=&mode=2` returns `200 OK`.
- Session 1634, `2025-11-30T15:51:46Z`: `DELETE https://admin.cloud.microsoft/admin/api/users/delete` returns `200 OK` for user object `a94d7433-c42b-44d1-a147-86bfca4277b0`.
- Session 1633, same time window: a parallel `portal.azure.com` request carries the standard-user token with `amr:["pwd","mfa"]`.
- Session 3724, `2025-11-30T15:54:39Z`: `GET https://portal.office.com/admin/api/users/currentUser` again returns `200 OK` for the admin identity with `amr:["pwd"]`, no `mfa`.

For reproduction, please validate the Entra sign-in logs specifically for the admin identity during the privileged action window. The expected security invariant is:

An admin identity subject to MFA / Conditional Access should not be able to perform Microsoft 365 Admin Center privileged write operations unless the sign-in event for that same admin identity has an MFA-satisfied result.

Observed result:

Privileged admin write operations were accepted while the captured token evidence for the admin identity shows password-only authentication.

I can provide a new continuous video reproduction with the Entra sign-in logs visible before and after the privileged action, including timestamps and correlation IDs.

