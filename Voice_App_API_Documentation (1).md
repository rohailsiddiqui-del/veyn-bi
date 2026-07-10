# Voice App API Documentation

*Authentication, Call Evaluation List, and Call Translation Export

## Overview

This document describes three endpoints:

- **Login** — authenticates a user and returns an access token
- **Call Evaluation List** — exports call evaluation records as a CSV file
- **Call Translation Export** — exports call translation text as a CSV file

Call Evaluation List endpoint require the access token returned by Login to be sent on the `Authorization` header of the request.
Call Translation Export required a static authorization Bearer token: "d1cf7f8c46caf960cae2ff929796a3bc7bedd191364db10f2edc4fa7f5abfd4a"

---

## 1. Login

Authenticates a user and returns an access token to be used by subsequent API calls.

### Endpoint

```
POST  https://autovox-be.veyn.co.uk/rbac/auth-user/login/
```

### Headers

| Header | Value |
|---|---|
| Content-Type | application/json |

### Request Body

```json
{
    "username": "example",
    "password": "123456"
}
```

### Request Fields

| Field | Type | Required | Description |
|---|---|---|---|
| username | string | Yes | Account username |
| password | string | Yes | Account password |

### Success Response — 200 OK

```json
{
    "message": "login_successful",
    "status_code": 200,
    "data": {
        "username": "example",
        "email": "info@example.com",
        "org": "Example Org",
        "org_id": 64,
        "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...…"
    },
    "total_count": null
}
```

### Response Fields

| Field | Description |
|---|---|
| message | Result status message |
| status_code | HTTP status code, mirrored in the body |
| data.username | Authenticated username |
| data.email | Account email address |
| data.org | Organization name the user belongs to |
| data.org_id | Organization ID — required as input to other APIs (e.g. Call Translation Export) |
| data.access | JWT access token. Send this in the `Authorization` header of subsequent requests |

> **Note:** The access token (`data.access`) is required by Call Evaluation List API.

---

## 2. Call Evaluation List

Returns a CSV export of call evaluation records for a given date range, sorted/filtered per the query parameters supplied.

### Endpoint

```
GET  https://autovox-be.veyn.co.uk/core/call-evaluation/evaluation_list/
     ?download=1&key=duration&order=desc&date_range=2025-08-01/2025-08-15
```

### Headers

| Header | Value |
|---|---|
| Authorization | Bearer `<access token from Login>` |

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| download | int (0/1) | Yes | Set to 1 to receive the CSV file export |
| key | string | No | Field to sort results by, e.g. `duration` |
| order | string | No | Sort direction: `asc` or `desc` |
| date_range | string | Yes | Date range filter in the form `start_date/end_date` (`YYYY-MM-DD/YYYY-MM-DD`) |

### Sample Request

```bash
curl -X GET \
  "https://autovox-be.veyn.co.uk/core/call-evaluation/evaluation_list/?download=1&key=duration&order=desc&date_range=2025-08-01/2025-08-15" \
  -H "Authorization: Bearer <access_token>"
```

### Success Response — 200 OK

Returns a CSV file as the response body.

| Header | Value |
|---|---|
| Content-Type | text/csv |
| Content-Disposition | `attachment; filename="<export_name>.csv"` |

### Error Responses

| Status | Cause |
|---|---|
| 400 | Missing or invalid `date_range`, or other invalid query parameters |
| 401 | Missing/invalid/expired access token |

---

## 3. Call Translation Export

Returns a CSV export of call translation text for all calls belonging to a given organization within a date range.


### Endpoint

```
GET  https://autovox-translation-api.veyn.ai/get_all_translations
     ?date_range=2025-08-01/2025-08-15&org_id=64
```
### Token to be used for authorization of this API
access_token = "d1cf7f8c46caf960cae2ff929796a3bc7bedd191364db10f2edc4fa7f5abfd4a"

### Headers

| Header | Value |
|---|---|
| Authorization | Bearer `<static access token>` |

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| date_range | string | Yes | Date range filter in the form `start_date/end_date` (`YYYY-MM-DD/YYYY-MM-DD`). Filters on call interaction date. |
| org_id | integer | Yes | Organization ID. Only calls belonging to this org are included. The organization id can be obtained from Login API response as `data.org_id`. |

### Sample Request

```bash
curl -X GET \
  "https://autovox-translation-api.veyn.ai/get_all_translations/?date_range=2025-08-01/2025-08-15&org_id=64" \
  -H "Authorization: Bearer <access_token>"
```

### Success Response — 200 OK

Returns a CSV file as the response body.

| Header | Value |
|---|---|
| Content-Type | text/csv |
| Content-Disposition | `attachment; filename="call_translations.csv"` |

### CSV Columns

| Column | Description |
|---|---|
| cri_id | Unique identifier of the call/interaction |
| name | Call/evaluation name |
| file_name | Original audio file name |
| path | Storage path of the audio file |
| formatted_translation | All translated segments for the call, one per line, formatted as: `(start – end, Speaker: text)`. Speaker is `CSR` or `Customer`. |

### Error Responses

| Status | Cause |
|---|---|
| 400 | `date_range` is missing, malformed (not `start/end`), not valid `YYYY-MM-DD` dates, or start date is after end date |
| 400 | `org_id` is missing |
| 401 | Missing/invalid access token |
| 500 | Unexpected server/database error while generating the export |

> **Note:** Rows with no matching translation data still appear in the export, with the Translation column left blank.
