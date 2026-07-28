-- Tighten Jeff's Kivv collection around cybersecurity and offensive security.
-- Apply to the production D1 database after deploying the matching changes.

BEGIN TRANSACTION;

UPDATE topics
SET topic_name = 'Offensive Security & Vulnerability Research',
    arxiv_query = 'cat:cs.CR AND (all:"penetration testing" OR all:"exploit development" OR all:"vulnerability research" OR all:"binary exploitation" OR all:"memory corruption" OR all:"remote code execution" OR all:"privilege escalation" OR all:"authentication bypass")',
    relevance_threshold = 0.75,
    max_papers_per_day = 20,
    generate_summaries = 1,
    enabled = 1
WHERE id = 21
  AND user_id = (SELECT id FROM users WHERE username = 'jeff');

UPDATE topics
SET topic_name = 'AI & Agent Offensive Security',
    arxiv_query = 'cat:cs.CR AND (all:"prompt injection" OR all:jailbreak OR all:"LLM attack" OR all:"agent security" OR all:"tool use attack" OR all:"function calling vulnerability" OR all:"model extraction" OR all:"data poisoning")',
    relevance_threshold = 0.75,
    max_papers_per_day = 20,
    generate_summaries = 1,
    enabled = 1
WHERE id = 22
  AND user_id = (SELECT id FROM users WHERE username = 'jeff');

UPDATE topics
SET topic_name = 'Malware, Reverse Engineering & Evasion',
    arxiv_query = 'cat:cs.CR AND (all:malware OR all:ransomware OR all:"reverse engineering" OR all:"binary analysis" OR all:obfuscation OR all:"anti-analysis" OR all:"command and control" OR all:"defense evasion")',
    relevance_threshold = 0.75,
    max_papers_per_day = 20,
    generate_summaries = 1,
    enabled = 1
WHERE id = 23
  AND user_id = (SELECT id FROM users WHERE username = 'jeff');

UPDATE topics
SET topic_name = 'Fuzzing, Program Analysis & Exploitation',
    arxiv_query = '(cat:cs.CR OR cat:cs.SE) AND (all:fuzzing OR all:"fuzz testing" OR all:"vulnerability discovery" OR all:"bug finding" OR all:"symbolic execution" OR all:"program analysis" OR all:"binary analysis" OR all:"memory corruption") AND (all:security OR all:vulnerability OR all:exploit OR all:attack OR all:malware)',
    relevance_threshold = 0.75,
    max_papers_per_day = 20,
    generate_summaries = 1,
    enabled = 1
WHERE id = 24
  AND user_id = (SELECT id FROM users WHERE username = 'jeff');

UPDATE topics
SET topic_name = 'Web, API & Cloud Security',
    arxiv_query = '(cat:cs.CR OR cat:cs.SE) AND (all:"web security" OR all:"API security" OR all:"cloud security" OR all:XSS OR all:"SQL injection" OR all:SSRF OR all:"request smuggling" OR all:deserialization OR all:"access control" OR all:"authentication bypass")',
    relevance_threshold = 0.75,
    max_papers_per_day = 20,
    generate_summaries = 1,
    enabled = 1
WHERE id = 25
  AND user_id = (SELECT id FROM users WHERE username = 'jeff');

UPDATE topics
SET topic_name = 'Windows, Endpoint & Driver Security',
    arxiv_query = 'cat:cs.CR AND (all:Windows OR all:kernel OR all:driver OR all:EDR OR all:"endpoint detection" OR all:"process injection" OR all:AMSI OR all:BYOVD) AND (all:vulnerability OR all:exploit OR all:attack OR all:evasion OR all:"reverse engineering" OR all:"privilege escalation")',
    relevance_threshold = 0.75,
    max_papers_per_day = 20,
    generate_summaries = 1,
    enabled = 1
WHERE id = 26
  AND user_id = (SELECT id FROM users WHERE username = 'jeff');

COMMIT;
