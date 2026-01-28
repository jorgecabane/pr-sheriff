# PR Bot Backend

Internal backend service powering the **PR Sheriff GitHub App**.

This system orchestrates Pull Request review workflows by reacting to GitHub events, reading declarative configuration from repositories, assigning reviewers automatically, and coordinating Slack notifications and reminders.

It is designed as an **internal developer productivity tool**, optimized for clarity, correctness, and extensibility rather than public SaaS concerns.

---

## ✨ What this does

* Listens to GitHub App webhooks (`pull_request`, `pull_request_review`)
* Reads per-repository configuration from `.pr-sheriff.yml`
* Automatically assigns reviewers based on configurable strategies
* Notifies Slack channels when PRs are created or updated
* Sends daily DM reminders to reviewers with pending PRs
* Surfaces stalled PRs (“blame list”) in team channels
* Runs scheduled jobs (cron) to re-evaluate PR state

The bot **assists developers** — it never blocks, enforces, or overrides manual decisions.

---

## 🧠 Design philosophy

* **Configuration-driven**: behavior is defined declaratively, not hardcoded
* **GitHub is the source of truth** for PR state
* **Minimal permissions** (principle of least privilege)
* **Event-driven + scheduled** responsibilities are clearly separated
* **Idempotent by default** (safe against duplicated webhooks)
* **Observable and debuggable** over “clever” abstractions

Non-goals:

* Public SaaS
* Multi-tenancy
* Billing / rate limiting
* GitHub Teams as a dependency

---

## 🏗️ High-level architecture

```
GitHub (App)
   │
   │  Webhooks
   ▼
Backend API
   ├─ Webhook handlers
   ├─ Config loader (.pr-sheriff.yml)
   ├─ Assignment engine
   ├─ Notification engine (Slack)
   ├─ Scheduler / cron jobs
   └─ Persistence layer (minimal)
```

### Core responsibilities

| Component         | Responsibility                                  |
| ----------------- | ----------------------------------------------- |
| Webhook handler   | React to PR lifecycle events                    |
| Config loader     | Fetch + validate `.pr-sheriff.yml`                  |
| Assignment engine | Select reviewers via strategies                 |
| Scheduler         | Periodic reminders and blame reports            |
| Slack client      | All Slack side-effects                          |
| Persistence       | Track derived state (timestamps, notifications) |

---

## 📁 Configuration model

### 1️⃣ Repository-level config (`.pr-sheriff.yml`)

Lives inside each repository and defines team structure and rules.

Example:

```yaml
team:
  name: Integrations
  members:
    - github: jorgecabane
      slack: U07QU7B1D46

github:
  auto_assign:
    enabled: true
    reviewers_per_pr: 1
    assignment_strategy: round-robin
    exclude_authors: true

notifications:
  new_pr_notifications:
    enabled: true
    channel: "#integrations"

rules:
  timezone: America/Santiago
```

This file is:

* Declarative
* Versionable
* Validated against a schema

---

### 2️⃣ Backend config (`config.yml`)

Defines global defaults, available strategies, and feature flags.

This config:

* Lives with the backend
* Is version-controlled
* Is loaded at startup

---

### 3️⃣ Runtime config resolution

```
Raw YAML
  → Parse
  → Schema validation
  → Defaults + overrides
  → Typed runtime config
  → Business logic
```

No service reads raw YAML directly.

---

## 🔐 Authentication & permissions

This backend authenticates as a **GitHub App**:

1. Private key → JWT
2. JWT → Installation token
3. Installation token → GitHub API

Minimal permissions:

* Pull requests: Read & write
* Issues: Read & write
* Contents: Read-only
* Metadata: Read-only

The app only sees repositories where it is installed.

---

## ⏱️ Scheduled jobs

Scheduled tasks periodically:

* List open PRs per installation
* Re-evaluate reminder and blame conditions
* Send Slack messages if rules apply

Cron jobs **do not mutate GitHub state**, only notify.

---

## 🧪 Testing strategy

* Webhook payload fixtures
* Deterministic assignment strategy tests
* Config schema validation tests
* Slack client mocked at boundary

---

## 🚀 Local development

High-level flow:

1. Expose `/webhook/github` locally
2. Use GitHub App + webhook delivery UI
3. Create PRs in test repo
4. Observe logs and Slack output

Secrets are provided via environment variables.

---

## 📌 Guiding rules (TL;DR)

* Configuration is a contract
* GitHub owns state
* The bot assists, never enforces
* Simple beats clever
* Explicit beats magical

---

## 📄 License

Internal use only.
Not intended for public distribution.