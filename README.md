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
   ├─ Job endpoints (HTTP) - /jobs/reminders, /jobs/blame
   └─ Persistence layer (optional, graceful degradation)
```

### Core responsibilities

| Component         | Responsibility                                  |
| ----------------- | ----------------------------------------------- |
| Webhook handler   | React to PR lifecycle events                    |
| Config loader     | Fetch + validate `.pr-sheriff.yml`                  |
| Assignment engine | Select reviewers via strategies                 |
| Job endpoints     | HTTP endpoints for external cron (reminders, blame) |
| Slack client      | All Slack side-effects                          |
| Persistence       | Track derived state (timestamps, notifications) - optional |

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

Scheduled tasks run via **HTTP endpoints** (designed for external cron services like Vercel Cron, GCP Cloud Scheduler):

* `/jobs/reminders` - Sends daily DM reminders to reviewers with pending PRs
* `/jobs/blame` - Reports stale PRs (older than configured days) to team channels

Both endpoints:
* Are protected by `JOBS_SECRET_TOKEN` (Bearer token authentication)
* Can work **with or without database** (graceful degradation)
* Use `GITHUB_INSTALLATION_ID` env var if database is unavailable
* **Do not mutate GitHub state**, only notify

### Stateless mode (without database)

The system can operate without a database:
* Webhooks work fully (assignment, notifications)
* Jobs require `GITHUB_INSTALLATION_ID` env var to identify installations
* Notification tracking is disabled (may allow duplicates on webhook retries)
* Round-robin strategy falls back to in-memory state

### With database

* Jobs can discover installations and repositories automatically
* Notification tracking prevents duplicates
* Round-robin strategy persists state across restarts

---

## 🧪 Testing strategy

* Webhook payload fixtures
* Deterministic assignment strategy tests
* Config schema validation tests
* Slack client mocked at boundary

---

## 🚀 Local development

High-level flow:

1. Expose `/webhook/github` locally (use ngrok or similar)
2. Configure GitHub App webhook to point to your local endpoint
3. Create PRs in test repo
4. Observe logs and Slack output

### Environment variables

Required:
* `GITHUB_APP_ID` - GitHub App ID
* `GITHUB_PRIVATE_KEY_PATH` or `GITHUB_PRIVATE_KEY_CONTENT` - Private key (file path or content)
* `GITHUB_WEBHOOK_SECRET` - Webhook secret for signature validation
* `SLACK_BOT_TOKEN` - Slack bot token

Optional (for jobs without database):
* `GITHUB_INSTALLATION_ID` - Installation ID (if not using database)
* `JOBS_SECRET_TOKEN` - Secret token for job endpoints authentication

Optional (for database features):
* `DATABASE_URL` - PostgreSQL connection string

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