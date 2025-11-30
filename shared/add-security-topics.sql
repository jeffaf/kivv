-- =============================================================================
-- Add Offensive Security Research Topics for Jeff
-- =============================================================================
-- These topics cover adversarial ML, vulnerability research, malware analysis,
-- network attacks, and reverse engineering from academic publications
-- =============================================================================

-- Get Jeff's user ID (should be 1)
-- INSERT topics for offensive security research

INSERT INTO topics (user_id, topic_name, arxiv_query, enabled, relevance_threshold, max_papers_per_day) VALUES
  -- 1. Adversarial ML & AI Security
  (1, 'Adversarial ML & AI Security',
   'cat:cs.CR OR cat:cs.LG AND (adversarial attack OR evasion attack OR model poisoning OR backdoor attack OR prompt injection OR jailbreak OR LLM security OR adversarial example OR robustness)',
   1, 0.7, 50),

  -- 2. Vulnerability Research & Exploitation
  (1, 'Vulnerability Research & Exploitation',
   'cat:cs.CR OR cat:cs.SE AND (fuzzing OR binary analysis OR vulnerability detection OR memory corruption OR buffer overflow OR exploit OR static analysis OR dynamic analysis OR symbolic execution)',
   1, 0.7, 50),

  -- 3. Malware & Evasion Techniques
  (1, 'Malware & Evasion',
   'cat:cs.CR AND (malware detection OR malware analysis OR evasion technique OR obfuscation OR covert channel OR DNS tunneling OR steganography OR anti-analysis)',
   1, 0.7, 50),

  -- 4. Network/System Attacks
  (1, 'Network & System Attacks',
   'cat:cs.CR OR cat:cs.NI AND (intrusion detection OR network attack OR side-channel OR authentication bypass OR protocol security OR DDoS OR man-in-the-middle OR timing attack)',
   1, 0.7, 50),

  -- 5. Software Security & Reverse Engineering
  (1, 'Software Security & Reverse Engineering',
   'cat:cs.CR OR cat:cs.SE AND (reverse engineering OR decompilation OR code analysis OR taint analysis OR symbolic execution OR program analysis OR binary instrumentation)',
   1, 0.7, 50);
