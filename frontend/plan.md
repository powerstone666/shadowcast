# UI Plan – YouTube Automation Platform
Framework: React + Ant Design (AntStack)

The UI is divided into **3 main sections**:

1. YouTube Data
2. Automation Dashboard
3. API Configuration & Authentication

The UI is designed primarily for **monitoring and configuration**, not manual control.

---

# Overall Layout

Use Ant Design Layout.

Layout
├─ Sider (Navigation)
├─ Header (Channel + Status)
└─ Content (Active Section)

Navigation Menu:

YouTube
- Overview
- Videos

Automation
- Live Dashboard
- Job Queue
- Logs

Configuration
- API Config
- YouTube Auth
- Pipeline Settings

---

# Section 1 — YouTube Data

Purpose:
Display **YouTube channel performance and upload statistics**.

Page: `/youtube/overview`

## Metrics Cards (Top Row)

Use `Card + Statistic`

Metrics:

1. Subscribers
2. Total Views
3. Total Videos Uploaded
4. Videos Uploaded (Last 24h)
5. Monetization Status

Example Layout:

Row
├─ Card: Subscribers
├─ Card: Total Views
├─ Card: Total Videos
├─ Card: Videos (24h)
└─ Card: Monetization

Components:
- Card
- Statistic
- Row
- Col

---

## Recent Videos Table

Shows last uploaded videos.

Columns:

- Thumbnail
- Title
- Genre
- Publish Time
- Views
- Status
- Run ID

Components:

- Table
- Tag (status)
- Avatar (thumbnail)

Example Status Tags:

uploaded
processing
failed

---

## Performance Panel

Use `Card`

Metrics:

- Avg Views (7 days)
- Top Performing Genre
- Last Upload Time

Optional:

Line chart of views growth.

Components:

- Card
- Progress
- Statistic

---

# Section 2 — Automation Dashboard

Purpose:
Monitor the **automation pipeline and job status**.

Page: `/automation/dashboard`

This is the **most important section**.

---

## Current Pipeline Run

Card displaying **active pipeline stage**.

Stages:

planning  
topic_search  
script_generation  
council_review  
segment_planning  
media_generation  
rendering  
uploading

Components:

- Steps
- Progress
- Card

---

## Automation Status Panel

Displays:

- Active Jobs
- Pending Jobs
- Failed Jobs
- Completed Today

Components:

- Statistic
- Card
- Badge

Example Layout:

Row
├─ Active Jobs
├─ Queue Size
├─ Failed Jobs
└─ Completed Today

---

## Genre Selection Panel

Allows user to control **genre pool**.

Shows:

- Enabled Genres
- Genre Usage (14 days)
- User Priority Weight

User Actions:

- Enable / disable genre
- Adjust weight

Components:

- Table
- Switch
- Slider
- Tag

Columns:

Genre  
Enabled  
Weight  
Used Recently

---

## Live Pipeline Logs

Shows real-time automation logs.

Example logs:

[12:01] genre selected: history  
[12:02] trend search completed  
[12:03] topic chosen: roman senate  
[12:05] script generated  
[12:07] council score: 8.2  
[12:08] segment planning done  

Components:

- Card
- Typography.Text
- Scroll container

---

# Section 3 — API Configuration & Authentication

Purpose:
Configure system integrations and API keys.

Page: `/config`

---

## YouTube Authentication

Shows connection state.

Fields:

Channel Name  
Channel ID  
Token Status  
Last Sync Time

Actions:

Connect YouTube  
Reconnect  
Disconnect

Components:

- Card
- Button
- Tag
- Descriptions

---

## API Keys Configuration

List of services:

OpenAI / LLM  
Qwen  
Search API  
TTS / Video Generator

Columns:

Service  
Status  
Key Configured  
Last Check

Actions:

Add Key  
Update Key  
Test Connection

Components:

- Table
- Modal
- Form
- Input.Password
- Button

---

## Pipeline Settings

System configuration parameters.

Fields:

Council Score Threshold  
Max Script Rewrites  
Segment Duration Limit  
Max Concurrent Jobs  
Retry Limit

Components:

- Form
- InputNumber
- Slider
- Switch
- Save Button

---

# Header (Global UI)

Shows:

Channel Name  
Automation Status  
System Health  

Components:

- Avatar
- Badge
- Space
- Dropdown

---

# UI Design Principles

1. UI is **monitor-first**
2. Pipeline should run **without user interaction**
3. Display **automation decisions clearly**
4. Highlight **failures and system health**

---

# Ant Design Components Used

Layout  
Menu  
Card  
Statistic  
Table  
Tag  
Steps  
Progress  
Badge  
Form  
Input  
InputNumber  
Slider  
Switch  
Modal  
Descriptions  
Typography

---

# Future UI Extensions

Multi-channel support  
Analytics charts  
Thumbnail preview system  
Script history viewer  
Pipeline debugging panel