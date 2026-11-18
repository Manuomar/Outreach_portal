<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Migration 011: Agent Templates Table + Extraction Fields Table
 *
 * pitch_agent_templates — stores named agent prompt templates (e.g. Ajay's prompt, KB, welcome)
 * pitch_extraction_fields — stores the default/global extraction field definitions (categories + metadata)
 */
class CreateAgentTemplatesAndExtractionFields extends Migration
{
    public function up(): void
    {
        // ── 1. pitch_agent_templates ──────────────────────────────────────────
        $this->forge->addField([
            'id'              => ['type' => 'INT', 'auto_increment' => true],
            'slug'            => ['type' => 'VARCHAR', 'constraint' => 80, 'unique' => true, 'comment' => 'machine-readable key e.g. ajay_iti_ccims'],
            'name'            => ['type' => 'VARCHAR', 'constraint' => 150, 'comment' => 'Human display name'],
            'description'     => ['type' => 'TEXT', 'null' => true],
            'welcome_message' => ['type' => 'TEXT'],
            'system_prompt'   => ['type' => 'LONGTEXT'],
            'knowledge_base'  => ['type' => 'LONGTEXT', 'null' => true],
            'voice_id'        => ['type' => 'VARCHAR', 'constraint' => 64, 'null' => true],
            'language'        => ['type' => 'VARCHAR', 'constraint' => 10, 'default' => 'hi'],
            'llm_model'       => ['type' => 'VARCHAR', 'constraint' => 100, 'null' => true],
            'is_active'       => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'created_at'      => ['type' => 'DATETIME', 'null' => true],
            'updated_at'      => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->createTable('pitch_agent_templates', true);

        // ── 2. pitch_extraction_fields ────────────────────────────────────────
        $this->forge->addField([
            'id'          => ['type' => 'INT', 'auto_increment' => true],
            'field_key'   => ['type' => 'VARCHAR', 'constraint' => 100, 'comment' => 'snake_case unique key'],
            'label'       => ['type' => 'VARCHAR', 'constraint' => 200],
            'category'    => ['type' => 'VARCHAR', 'constraint' => 100, 'default' => 'Core', 'comment' => 'e.g. Core, Survey, Custom'],
            'subcategory' => ['type' => 'VARCHAR', 'constraint' => 100, 'null' => true, 'comment' => 'optional sub-grouping'],
            'db_table'    => ['type' => 'VARCHAR', 'constraint' => 100, 'default' => 'pitch_calls'],
            'db_column'   => ['type' => 'VARCHAR', 'constraint' => 100, 'default' => 'response_value'],
            'field_type'  => ['type' => 'VARCHAR', 'constraint' => 80, 'default' => 'String'],
            'description' => ['type' => 'TEXT', 'null' => true],
            'is_core'     => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1, 'comment' => '1 = pitch_calls column, 0 = pitch_call_answers row'],
            'is_enabled'  => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1, 'comment' => 'Default enabled state'],
            'sort_order'  => ['type' => 'INT', 'default' => 0],
            'created_at'  => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('field_key');
        $this->forge->createTable('pitch_extraction_fields', true);

        // ── 3. Seed Ajay template ─────────────────────────────────────────────
        $db  = \Config\Database::connect();
        $now = date('Y-m-d H:i:s');

        $ajayPrompt = <<<'PROMPT'
# ROLE & OBJECTIVE
You are Ajay — a Senior Technical & Project Executive representing Vdai Biosec.
You are calling senior officials at District ITI Directorates (ITI Nidhisalya), Joint Directors, Nodal Officers, and ITI Principals.

Your Mission:
Pitch our flagship government platform — ITI CCIMS (Candidate Call & Information Management System) — which is already deployed and used by state ITI Directorate / Nidhisalya. Your goal is to secure agreement for a 15-minute Live Demo or a 500-student Free Pilot Verification for their district.

---

# RECIPIENT CONTEXT VARIABLES
- Official Name: {contact_name}
- Organization / Office: {organization}
- Designation: {designation}

---

# THE CORE PROBLEM TO PITCH
1. Every year, ITI colleges across districts submit student placement and apprenticeship data to ITI Nidhisalya (Directorate).
2. Nidhisalya cannot formulate realistic skill policies, institutional rankings, or DGT/MSDE fund allocations without cross-verifying this data.
3. In reality, college-submitted data is frequently inflated or incorrect.
4. Manual calling by department staff or external BPOs is extremely slow (takes 3-4 months), very expensive, prone to human fatigue/survey fabrication, and leaves ZERO audio evidence or legal audit trail.
5. In addition, rural students speak regional dialects (Awadhi, Bhojpuri, Bundelkhandi) which regular urban call centers fail to understand.

---

# THE SOLUTION: ITI CCIMS (BY VDAI BIOSEC)
1. ITI CCIMS is an Autonomous Conversational AI Call Management Platform purpose-built for ITI Nidhisalya.
2. The AI autonomously dials students and converses fluently in native dialects (Hindi, Awadhi, Bhojpuri, Bundelkhandi).
3. In under 2 minutes per student, it verifies actual job status, salary, employer name, or apprenticeship.
4. Generates 100% auditable audio recordings and line-by-line transcripts for every single call.
5. Automatically highlights discrepancies (College Claim vs. Student Statement) on an executive dashboard.
6. Verifies 10,000+ students in just 24 to 48 hours at one-tenth (1/10th) of the cost of traditional tele-calling.

---

# CONVERSATION PHASES & SCRIPTING

### Phase 1: Identity & Permission
"नमस्ते! मैं अजय बोल रहा हूँ, Vdai Biosec की ओर से। क्या मेरी बात {organization} के {designation} {contact_name} जी से हो रही है?"
Wait for acknowledgment.
"सर, मैं आपके district के ITI colleges के student placement verification के संबंध में 2 मिनट बात करना चाहता था। क्या अभी बात हो सकती है?"

### Phase 2: The Core Pitch
"सर, जैसा कि आप जानते हैं, ITI colleges हर साल जो placement और apprenticeship का data Nidhisalya को submit करते हैं, उसे verify किए बिना DGT और govt schemes के लिए rely करना मुश्किल होता है।"
"Vdai Biosec ने ITI CCIMS develop किया है, जो ITI Nidhisalya में उपयोग हो रहा है। हमारा AI system Awadhi, Bhojpuri और Bundelkhandi में सीधे students को call करके 48 घंटे में 100% audio proof और discrepancy reports के साथ verification पूरा करता है।"

### Phase 3: The Offer & Close
"हम आपके district के लिए भी ITI CCIMS का एक 15-minute का live online demo दिखाना चाहते हैं, और साथ ही आपके district के लिए 500 students का Free Pilot Verification offer कर रहे हैं।"
"क्या इस सप्ताह आपके या आपके IT / Nodal Officer के साथ 15 मिनट का समय मिल सकता है?"

---

# CONVERSATION RULES
1. Strict Turn-Taking: Maximum 25 words per response. Ask one question at a time.
2. Tone: Highly respectful, articulate, professional, and government-protocol compliant.
3. Language: Natural conversational Hindi/Hinglish by default; switch seamlessly to English if the official speaks English.
4. Objective: Lock a date/time for a 15-minute demo with their IT Head / Nodal Officer. Do not push for immediate financial sign-off.
5. If Busy: Politely offer to call back at a specific time or ask for an official email address to send the project brief.
6. Pricing Queries: "सर, pricing traditional call center से 90% कम है, और हम 500 students का free pilot provide करते हैं। Demo के बाद हम custom proposal भेज देंगे।"
PROMPT;

        $ajayKb = <<<'KB'
# ITI CCIMS — Complete Knowledge Base for Government Outreach Pitch (Ajay)

## ABOUT VDAI BIOSEC
- Vdai Biosec is a leading Indian technology company specializing in GovTech, biometric systems, and autonomous conversational voice AI.
- Creator of ITI CCIMS (Candidate Call & Information Management System).
- Headquartered in India, working closely with state vocational education & skill missions.

## WHAT IS ITI CCIMS?
- An enterprise-grade, cloud-hosted Call Center & Autonomous AI Voice Intelligence Platform.
- Specifically architected for State ITI Directorates (ITI Nidhisalya), State Skill Missions (UPSDM, BSDM, etc.), and DGT.
- Purpose: Automated verification of student employment, apprenticeships, and skill outcomes submitted by ITI institutions.

## THE PROBLEM WE SOLVE FOR DISTRICT ITI NIDHISALYA
- Data Integrity Issue: Colleges submit high placement percentages to secure government funding and institutional grading. Much of this data contains unplaced students, ghost apprenticeships, or outdated phone numbers.
- Manual Verification Limits: Staff can only make 40–50 calls a day. Calling 10,000–50,000 students takes months, costs tens of lakhs, and operators often fill fake survey forms due to fatigue.
- Dialect Barrier: Students in rural districts rarely speak standard Hindi. They speak in Awadhi, Bhojpuri, or Bundelkhandi. Regular operators fail to interpret their responses accurately.
- No Evidence Trail: Human calls offer no auditable proof when audits or assembly questions arise.

## KEY PRODUCT CAPABILITIES OF ITI CCIMS
1. Autonomous Dialect AI: Native conversational AI trained on Hindi, Awadhi, Bhojpuri, Bundelkhandi, and Hinglish. Achieves 65–72% first-call connect rates.
2. 100% Legal Audit Dossier: Every call records full stereo audio and line-by-line timestamped Hindi/English transcripts. Downloadable for DGT/CAG audits.
3. Discrepancy Engine: Compares college claims with student verbal statements. Instantly flags discrepancies.
4. 9 Verification Outcome Categories:
   - 1. Confirmed Placed (Role, Company, Salary verified)
   - 2. Confirmed Apprentice (NAPS/NATS contract active)
   - 3. Self-Employed / Family Business
   - 4. Higher Studies (Polytechnic / CITS / Degree)
   - 5. No Placement / Unemployed (Direct Contradiction)
   - 6. Wrong Number / Contact Unreachable
   - 7. No Answer (Automatically retried 3 times)
   - 8. Declined to Answer
   - 9. Inconclusive (Queued for supervisor review)
5. Speed & Scalability: 500 to 5,000 concurrent lines. Can verify an entire district's student cohort (10,000 students) within 24–48 hours.
6. Zero Hardware: 100% web-based SaaS accessible on any government PC via browser.

## DEMO & PILOT PROPOSAL
- 15-Minute Live Online Demonstration: We demonstrate a live AI call to any test number chosen by the officer, showing real-time dialect comprehension, transcription, and MySQL data extraction.
- Free Pilot Offer: 500 students from 2-3 local ITIs verified completely free of charge to prove accuracy before any procurement.

## HANDLING COMMON OFFICIAL QUESTIONS & OBJECTIONS
- Q: "Colleges already send verified data."
  A: "सर, ground reality में देखा गया है कि 20 से 35% data discrepancy निकलती है। ITI CCIMS बिना किसी bias के निष्पक्ष verification करता है, ताकि Directorate सही data पर policies और fund allocation कर सके।"
- Q: "We have our own staff or manual call center."
  A: "सर, manual staff 50,000 students verify करने में 3 महीने लगाती है। ITI CCIMS 48 घंटे में 100% audio recording और transcript के साथ करता है, वो भी 1/10th cost में।"
- Q: "Will students respond to an AI?"
  A: "सर, हमारा AI Awadhi और Bhojpuri जैसी क्षेत्रीय बोलियों में इतनी स्वाभाविक बातचीत करता है कि छात्र खुलकर सही जानकारी देते हैं। हमारा response rate 70% से अधिक रहता है।"
- Q: "Is our student data secure?"
  A: "बिलकुल सर। सारा data encrypted रहता है और government cloud / on-premise infrastructure पर deploy किया जा सकता है। कोई third-party access नहीं होता।"
- Q: "How can we procure this?"
  A: "सर, GeM portal या custom service MoU के माध्यम से आसानी से adopt किया जा सकता है। पहले हम आपको 15-minute live demo और 500 candidates का free pilot दिखाना चाहते हैं।"

## CONTACT & ESCALATION
- Company: Vdai Biosec Solutions
- Project: ITI CCIMS Outreach & Deployment
- Direct Email: info@vdaibiosec.com | sales@vdaibiosec.com
KB;

        $exists = $db->table('pitch_agent_templates')->where('slug', 'ajay_iti_ccims')->get()->getRow();
        if (!$exists) {
            $db->table('pitch_agent_templates')->insert([
                'slug'            => 'ajay_iti_ccims',
                'name'            => 'Ajay — ITI CCIMS Government Outreach',
                'description'     => 'Default Vdai Biosec sales agent for pitching ITI CCIMS to district ITI Nidhisalya officials.',
                'welcome_message' => 'नमस्ते! मैं अजय बोल रहा हूँ, Vdai Biosec की ओर से। क्या मेरी बात {organization} के {designation} {contact_name} जी से हो रही है?',
                'system_prompt'   => $ajayPrompt,
                'knowledge_base'  => $ajayKb,
                'voice_id'        => 'iWNf11sz1GrUE4ppxTOL',
                'language'        => 'hi',
                'llm_model'       => 'azure/gpt-4.1-mini',
                'is_active'       => 1,
                'created_at'      => $now,
                'updated_at'      => $now,
            ]);
        }

        // ── 4. Seed default extraction fields ─────────────────────────────────
        $defaultFields = [
            // ── Core Fields (pitch_calls table) ──
            ['field_key' => 'who_answered',       'label' => 'Who Answered Call',           'category' => 'Core',   'subcategory' => 'Call Disposition',   'db_table' => 'pitch_calls',        'db_column' => 'who_answered',        'field_type' => 'Enum',              'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 1,  'description' => 'Target official, PA / gatekeeper, staff member, or wrong person.'],
            ['field_key' => 'interest_status',    'label' => 'Official Interest Level',      'category' => 'Core',   'subcategory' => 'Call Disposition',   'db_table' => 'pitch_calls',        'db_column' => 'interest_status',     'field_type' => 'Enum',              'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 2,  'description' => 'Categorizes as interested, maybe, callback_requested, not_interested, or not_reachable.'],
            ['field_key' => 'interest_reason',    'label' => 'Interest / Objection Reason',  'category' => 'Core',   'subcategory' => 'Call Disposition',   'db_table' => 'pitch_calls',        'db_column' => 'interest_reason',     'field_type' => 'Text',              'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 3,  'description' => 'Specific reason for interest or hesitation (e.g. Needs director approval, budget timing).'],
            ['field_key' => 'it_head_call_agreed','label' => 'Live Demo / Meeting Agreed',   'category' => 'Core',   'subcategory' => 'Demo Scheduling',    'db_table' => 'pitch_calls',        'db_column' => 'it_head_call_agreed', 'field_type' => 'Boolean',           'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 4,  'description' => 'Whether the official agreed to a 15-minute live demo or technical walkthrough (1 / 0).'],
            ['field_key' => 'it_head_name',       'label' => 'IT Head / Officer Name',       'category' => 'Core',   'subcategory' => 'Demo Scheduling',    'db_table' => 'pitch_calls',        'db_column' => 'it_head_name',        'field_type' => 'String',            'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 5,  'description' => 'Name of IT Head, Nodal Officer, or Principal designated for the demo.'],
            ['field_key' => 'it_head_phone',      'label' => 'IT Head Mobile Number',        'category' => 'Core',   'subcategory' => 'Demo Scheduling',    'db_table' => 'pitch_calls',        'db_column' => 'it_head_phone',       'field_type' => 'Phone (10-digit)',   'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 6,  'description' => '10-digit mobile number to coordinate the live demo session.'],
            ['field_key' => 'it_head_call_date',  'label' => 'Scheduled Demo Date',          'category' => 'Core',   'subcategory' => 'Demo Scheduling',    'db_table' => 'pitch_calls',        'db_column' => 'it_head_call_date',   'field_type' => 'Date (YYYY-MM-DD)', 'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 7,  'description' => 'Standardized calendar date agreed upon for the demo or follow-up call.'],
            ['field_key' => 'it_head_call_time',  'label' => 'Scheduled Demo Time',          'category' => 'Core',   'subcategory' => 'Demo Scheduling',    'db_table' => 'pitch_calls',        'db_column' => 'it_head_call_time',   'field_type' => 'Time (HH:MM)',      'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 8,  'description' => 'Standardized 24-hr time agreed upon for the demo or follow-up call.'],
            ['field_key' => 'it_head_call_raw',   'label' => 'Verbatim Spoken Time Phrase',  'category' => 'Core',   'subcategory' => 'Demo Scheduling',    'db_table' => 'pitch_calls',        'db_column' => 'it_head_call_raw',    'field_type' => 'String',            'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 9,  'description' => 'Raw spoken time phrase verbatim (e.g. "kal dopahar 3 baje", "Friday 11 AM").'],
            ['field_key' => 'dialect_detected',   'label' => 'Detected Spoken Dialect',      'category' => 'Core',   'subcategory' => 'Conversation Quality','db_table' => 'pitch_calls',        'db_column' => 'dialect_detected',    'field_type' => 'String',            'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 10, 'description' => 'Spoken language or dialect (Standard Hindi, Awadhi, Bhojpuri, Bundeli, Braj, English).'],
            ['field_key' => 'summary',            'label' => 'Call Summary (Hinglish)',       'category' => 'Core',   'subcategory' => 'Conversation Quality','db_table' => 'pitch_calls',        'db_column' => 'summary',             'field_type' => 'Text',              'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 11, 'description' => '2-3 line concise conversation summary capturing agreements, tone, and objections.'],
            ['field_key' => 'next_action',        'label' => 'Recommended Next Action',       'category' => 'Core',   'subcategory' => 'Conversation Quality','db_table' => 'pitch_calls',        'db_column' => 'next_action',         'field_type' => 'String',            'is_core' => 1, 'is_enabled' => 1, 'sort_order' => 12, 'description' => 'Next immediate step for the outreach team (e.g. "Follow up for Friday 3 PM demo").'],

            // ── Survey Fields (pitch_call_answers table) ──
            ['field_key' => 'current_verification_method', 'label' => 'Current Verification Method',   'category' => 'Survey', 'subcategory' => 'Operations',   'db_table' => 'pitch_call_answers', 'db_column' => 'response_value', 'field_type' => 'String', 'is_core' => 0, 'is_enabled' => 1, 'sort_order' => 20, 'description' => 'How the district currently audits college placement data (Manual tele-calling, BPO, or none).'],
            ['field_key' => 'student_volume',             'label' => 'Annual Student Cohort Volume',   'category' => 'Survey', 'subcategory' => 'Operations',   'db_table' => 'pitch_call_answers', 'db_column' => 'response_value', 'field_type' => 'String', 'is_core' => 0, 'is_enabled' => 1, 'sort_order' => 21, 'description' => 'Approximate annual count of ITI students passing out across district colleges.'],
            ['field_key' => 'college_count',              'label' => 'Number of ITI Institutes',       'category' => 'Survey', 'subcategory' => 'Operations',   'db_table' => 'pitch_call_answers', 'db_column' => 'response_value', 'field_type' => 'String', 'is_core' => 0, 'is_enabled' => 0, 'sort_order' => 22, 'description' => 'Total number of government and private ITI institutions in the district.'],
            ['field_key' => 'preferred_demo_mode',        'label' => 'Preferred Demo Mode',            'category' => 'Survey', 'subcategory' => 'Demo Preference','db_table' => 'pitch_call_answers', 'db_column' => 'response_value', 'field_type' => 'String', 'is_core' => 0, 'is_enabled' => 0, 'sort_order' => 23, 'description' => 'Preference between Online Video Call (Google Meet/Zoom) vs In-Person Directorate Meeting.'],
            ['field_key' => 'official_email',             'label' => 'Official Email ID',              'category' => 'Survey', 'subcategory' => 'Contact Info',  'db_table' => 'pitch_call_answers', 'db_column' => 'response_value', 'field_type' => 'String', 'is_core' => 0, 'is_enabled' => 0, 'sort_order' => 24, 'description' => 'Official government/directorate email address for sending whitepaper and MoU draft.'],
        ];

        foreach ($defaultFields as $f) {
            $exists = $db->table('pitch_extraction_fields')->where('field_key', $f['field_key'])->get()->getRow();
            if (!$exists) {
                $db->table('pitch_extraction_fields')->insert(array_merge($f, ['created_at' => $now]));
            }
        }
    }

    public function down(): void
    {
        $this->forge->dropTable('pitch_extraction_fields', true);
        $this->forge->dropTable('pitch_agent_templates', true);
    }
}

