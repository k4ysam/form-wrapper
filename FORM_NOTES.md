# Medical Form — Selectors & Success Criteria

## Structure

Three **accordion sections** — all visible without scrolling.  
Section 1 ("Personal Information") is **open by default**.  
Sections 2 and 3 are **collapsed** — must click their header button to expand.

Accordion buttons selector:
```
button.flex.w-full.justify-between.rounded-lg.bg-blue-50
```
Or by role + name:
```
getByRole("button", { name: "Medical Information" })
getByRole("button", { name: "Emergency Contact" })
```

---

## Section 1 — Personal Information (open by default)

| Label              | `id`          | `name`        | Type   |
|--------------------|---------------|---------------|--------|
| First Name         | `firstName`   | `firstName`   | text   |
| Last Name          | `lastName`    | `lastName`    | text   |
| Date of Birth      | `dateOfBirth` | `dateOfBirth` | date   |
| Medical ID         | `medicalId`   | `medicalId`   | text   |

Playwright selectors:
```
#firstName
#lastName
#dateOfBirth   ← type="date", use fill("1990-01-01")
#medicalId
```

---

## Section 2 — Medical Information (accordion, click to expand)

| Label                | `id`          | `name`        | Type     |
|----------------------|---------------|---------------|----------|
| Gender               | `gender`      | `gender`      | select   |
| Blood Type           | `bloodType`   | `bloodType`   | select   |
| Allergies            | `allergies`   | `allergies`   | textarea |
| Current Medications  | `medications` | `medications` | textarea |

### Dropdown options

**Gender** (`#gender`):
| Value              | Label              |
|--------------------|--------------------|
| *(empty)*          | Select gender      |
| `male`             | Male               |
| `female`           | Female             |
| `other`            | Other              |
| `prefer-not-to-say`| Prefer not to say  |

**Blood Type** (`#bloodType`):
| Value | Label |
|-------|-------|
| *(empty)* | Select blood type |
| `A+`  | A+    |
| `A-`  | A-    |
| `B+`  | B+    |
| `B-`  | B-    |
| `AB+` | AB+   |
| `AB-` | AB-   |
| `O+`  | O+    |
| `O-`  | O-    |

---

## Section 3 — Emergency Contact (accordion, click to expand)

| Label                    | `id`               | `name`             | Type |
|--------------------------|--------------------|--------------------|------|
| Emergency Contact Name   | `emergencyContact` | `emergencyContact` | text |
| Emergency Contact Phone  | `emergencyPhone`   | `emergencyPhone`   | tel  |

---

## Submit Button

```
button[type="submit"]   // text: "Submit"
```

---

## Success Criteria

**TBD** — needs a live run with filled data to observe.  
Expected candidates: toast notification, success message text, or page/URL change.  
Agent should assert one of:
- A visible element containing text like "success", "submitted", "thank you"
- A URL change away from the form
- Disappearance of the submit button

---

## SOP Values (hardcoded defaults)

| Field          | Value        |
|----------------|--------------|
| First Name     | `John`       |
| Last Name      | `Doe`        |
| Date of Birth  | `1990-01-01` |
| Medical ID     | `91927885`   |
