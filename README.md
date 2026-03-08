# ShadowCast - YouTube Automation Pipeline

ShadowCast is an automated YouTube content creation system that generates compelling short-form videos using AI. The system researches trending topics, writes narrative scripts, creates anime-style visuals, and publishes videos to YouTube—all with minimal human intervention.

## 🎬 What Does It Do?

ShadowCast automates the entire YouTube content creation process:

1. **Research**: Finds trending topics and stories in configured genres
2. **Scripting**: Writes compelling narrative scripts (30-120 seconds) focused on stories, myths, and historical incidents
3. **Review**: Evaluates scripts through a multi-agent council system
4. **Visual Planning**: Creates detailed anime-style visual direction plans
5. **Video Generation**: Produces AI-generated anime-style videos with lip-synced dialogue
6. **Publishing**: Uploads finished videos to YouTube with proper metadata

## 🚀 How It Works - High-Level Overview

### The 7-Stage Automation Pipeline

```
1. Genre Selection → 2. Topic Discovery → 3. Script Generation → 
4. Council Review → 5. Director Planning → 6. Video Generation → 7. YouTube Publishing
```

#### **Stage 1: Genre Selection**
- Analyzes last 14 days of published content
- Considers user genre preferences and configured genre pool
- Uses search trends to select the most promising genre
- **Output**: Selected genre with confidence score

#### **Stage 2: Topic Discovery**
- Searches for trending stories and incidents within selected genre
- Focuses on mythological, historical, or fictional narratives
- Examples: "How Iran and US became rivals", "The day Zeus and Ares clashed"
- **Output**: Ranked list of story-based topics

#### **Stage 3: Script Generation**
- Transforms topics into compelling narrative scripts
- Creates 30-120 second stories with character dialogue
- Focuses on "incident-based" narratives (how things became, what happened when)
- **Output**: Complete script package with title, description, story, and summary

#### **Stage 4: Council Review**
- Three AI agents review each script:
  - **Critic**: Evaluates narrative quality and engagement
  - **Editor**: Checks structure and pacing
  - **Viewer**: Assesses audience appeal
- Scripts must pass a quality threshold
- **Output**: Approved script or rewrite request

#### **Stage 5: Director Planning**
- Breaks script into 15-second segments (max 120 seconds total)
- Creates anime-style visual direction for each segment
- Plans lip-synced dialogue and character animations
- **Output**: Detailed visual breakdown with timing and narration

#### **Stage 6: Video Generation**
- Generates individual video segments using AI video models
- Creates anime-style animations matching director's vision
- Stitches segments together into final video
- **Output**: Complete video file ready for upload

#### **Stage 7: YouTube Publishing**
- Uploads video to YouTube via OAuth
- Sets title, description, tags, and thumbnail
- Manages YouTube channel content strategy
- **Output**: Published YouTube video

## 📁 Project Architecture

### Root Structure
```
yt-automation/
├── backend/          # Node.js/TypeScript backend services
├── frontend/         # React/TypeScript dashboard UI
└── README.md         # This documentation
```

### Backend (`/backend`) - The Brain
```
backend/
├── src/
│   ├── orchestration/     # Core automation workflows
│   │   ├── workflows/     # Pipeline stages as state machines
│   │   ├── prompts/       # LLM prompts for each agent role
│   │   ├── tools/         # External service integrations
│   │   └── runtime/       # Agent execution environment
│   ├── services/          # Business logic and data services
│   ├── routes/           # REST API endpoints
│   ├── db/               # Database schemas and queries
│   └── utils/            # Shared utilities
├── package.json          # Backend dependencies
└── tsconfig.json        # TypeScript configuration
```

#### Key Backend Components:

**Workflows** (`/orchestration/workflows/`):
- `genreSelectionWorkflow.ts` - Stage 1: Genre decision logic
- `scriptGenerationWorkflow.ts` - Stage 3: Script writing with narrative focus
- `councilReviewWorkflow.ts` - Stage 4: Multi-agent quality review
- `directorPlanWorkflow.ts` - Stage 5: Visual planning (120-second max)
- `videoGenerationWorkflow.ts` - Stage 6: Video segment generation
- `youtubePublishWorkflow.ts` - Stage 7: YouTube upload

**Prompts** (`/orchestration/prompts/`):
- `scriptGenerationPrompt.txt` - Guides LLM to create story-based scripts
- `directorPlanPrompt.txt` - Visual planning with 120-second constraints
- `genreSelectionPrompt.txt` - Genre and topic selection logic
- Plus 10+ specialized prompts for each agent role

**Services** (`/services/`):
- `schedulerService.ts` - Pipeline scheduling and execution
- `pipelineRealtimeService.ts` - Real-time progress updates via WebSocket
- `contentMemoryService.ts` - 14-day content memory
- `ytOAuthService.ts` - YouTube API authentication
- `workflowControlService.ts` - Pipeline state management

### Frontend (`/frontend`) - The Dashboard
```
frontend/
├── src/
│   ├── components/        # React UI components
│   │   ├── dashboard/     # Pipeline monitoring
│   │   ├── overview/      # YouTube analytics
│   │   └── api-configuration/ # Settings interface
│   ├── services/          # Frontend API clients
│   ├── types.ts          # TypeScript type definitions
│   └── main.tsx          # Application entry point
├── package.json          # Frontend dependencies
└── vite.config.ts       # Build configuration
```

#### Key Frontend Components:

**Dashboard Components**:
- `DashboardSection.tsx` - Main pipeline monitoring interface
- `CurrentPipelineRun.tsx` - Real-time pipeline progress
- `LivePipelineLogs.tsx` - WebSocket log streaming
- `GenreSelectionPanel.tsx` - Genre configuration UI

**Overview Components**:
- `OverviewSection.tsx` - YouTube channel analytics
- `RecentVideosTable.tsx` - Published video management
- `PerformancePanel.tsx` - Video performance metrics
- `AudienceGrowth.tsx` - Channel growth tracking

## 🛠️ Getting Started

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL database
- YouTube API credentials (for publishing)
- AI model API keys (for script/video generation)

### Quick Setup

1. **Clone and Install:**
```bash
git clone <repository-url>
cd yt-automation
cd backend && npm install
cd ../frontend && npm install
```

2. **Database Setup:**
```sql
-- Run the schema files in order:
backend/src/db/content.sql
backend/src/db/genre.sql
backend/src/db/secrets.sql
backend/src/db/yt_oauth.sql
```

3. **Environment Configuration:**
```bash
# backend/.env
DATABASE_URL=postgresql://user:pass@localhost:5432/shadowcast
API_KEYS=your_llm_api_keys
YT_CLIENT_ID=your_youtube_client_id
YT_CLIENT_SECRET=your_youtube_client_secret
YT_REDIRECT_URI=http://localhost:3000/youtube/oauth/callback

# frontend/.env
VITE_API_BASE_URL=http://localhost:3000
```

4. **Run the System:**
```bash
# Terminal 1: Backend API
cd backend
npm run dev

# Terminal 2: Frontend Dashboard
cd frontend
npm run dev
```

5. **Access the Dashboard:**
- Open http://localhost:5173
- Configure your genres and API keys
- Start your first pipeline run

## 🔧 Configuration

### Genre Pool
Configure which genres the system can select from:
```json
{
  "selectedGenres": ["History", "Mythology", "Science", "Technology"],
  "userPreference": null
}
```

### Pipeline Settings
- **Video Length**: 30-120 seconds (configurable per genre)
- **Segment Duration**: 15 seconds maximum per segment
- **Council Threshold**: Minimum score for script approval
- **Schedule**: Daily/Weekly/Monthly pipeline runs

### Content Focus
The system is optimized for:
- **Story-based content**: "How X became Y", "The day Z happened"
- **Mythological narratives**: Greek gods, historical incidents
- **Character-driven plots**: Dialogue-focused scripts with emotional arcs
- **Anime-style visuals**: All generated videos use anime art style

## 📊 Monitoring and Management

### Real-Time Dashboard
- Live pipeline progress with stage-by-stage tracking
- WebSocket-based log streaming
- Success/failure rate analytics
- YouTube performance metrics

### Pipeline Control
- Start/stop/pause pipeline execution
- Manual script approval/rejection
- Video quality review before publishing
- Schedule adjustment and priority setting

### YouTube Integration
- OAuth-based channel authentication
- Automated video metadata optimization
- Performance tracking and analytics
- Comment and engagement monitoring

## 🔄 Pipeline Customization

### Modify Prompts
Edit files in `backend/src/orchestration/prompts/` to:
- Change narrative style and tone
- Adjust story focus (mythology, history, fiction)
- Modify visual direction (anime style, cinematic approach)
- Update content safety rules

### Add New Genres
1. Add genre to configuration pool
2. Create genre-specific research queries
3. Adjust prompt templates for the genre
4. Test with sample topics

### Extend Workflows
Each workflow is a LangGraph state machine:
```typescript
// Example: Adding a new review stage
const extendedGraph = new StateGraph(WorkflowState)
  .addNode("existingStage", ...)
  .addNode("newReviewStage", this.newReviewStage)
  .addEdge("existingStage", "newReviewStage")
  .addEdge("newReviewStage", END);
```

## 🚨 Troubleshooting

### Common Issues

**Pipeline Stuck at Director Plan:**
- Check 120-second duration constraint in `directorPlanPrompt.txt`
- Verify segment durations sum to ≤ 120 seconds
- Review visual direction content safety rules

**YouTube Upload Fails:**
- Verify OAuth tokens are valid
- Check YouTube API quota limits
- Confirm video meets YouTube content policies

**Script Quality Issues:**
- Adjust council review thresholds
- Modify script generation prompts
- Update 14-day memory to avoid topic repetition

**Video Generation Errors:**
- Check AI model API keys and quotas
- Verify video prompt sanitization rules
- Ensure segment durations match planned timing

### Logs and Debugging
- Backend logs: `backend/nodemon.json` configures logging
- Frontend logs: Browser console + WebSocket messages
- Pipeline logs: Real-time in dashboard interface
- Database logs: PostgreSQL query logs

## 📈 Performance Metrics

The system tracks:
- **Pipeline Success Rate**: % of completed runs
- **Script Quality Score**: Council review averages
- **Video Generation Time**: Per segment and total
- **YouTube Performance**: Views, engagement, retention
- **Audience Growth**: Subscribers and watch time

## 🔮 Future Enhancements

Planned features:
- Multi-language content support
- A/B testing for titles and thumbnails
- Advanced audience analytics
- Cross-platform publishing (TikTok, Instagram)
- Custom visual style pipelines
- Collaborative editing interface

## 📄 License & Attribution

ShadowCast is built for automated content creation research and development. Ensure compliance with:
- YouTube Terms of Service
- AI model usage policies
- Copyright and fair use guidelines
- Content disclosure requirements

---

*ShadowCast - Turning stories into screens, automatically.*