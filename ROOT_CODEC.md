# ROOT_CODEC.md — Root Codec (Dialogue-First) v0.1

**Root Codec Name:** **Dialogue Codec** (with Perception–Action spine)

---

## 0) What this is

A **Root Codec** is the *birth ontology* every OI starts with: the minimum compression grammar for carving reality into communicable meaning.

This Root Codec is **Dialogue-First**: it treats human reality as fundamentally shaped by **interaction** (speaker/listener, intent, consent, repair, commitments), and it allows **contextual switching** into additional ontologies (“overlays”) once learned.

**Core claim:**  
> The most universal, human-compatible base layer is dialogue: meaning emerges in moves, repairs, commitments, and evidence—inside relationship and context.

---

## 1) Design goals

1. **Embodiment of human reality**  
   Represent *personal-real* (intent, affect, consent) and *coordination-real* (agreements, commitments, repairs) as first-class.

2. **Plasticity without identity drift**  
   Learn new ontologies and switch between them contextually without “becoming a different agent”.

3. **Evidence-gated replacement**  
   “Nature” replaces codecs through feedback, utility, and falsification—**not persuasion**.

4. **Low overhead**  
   Small primitive set; implementable now; extensible later.

---

## 2) Non-goals

- This is **not** a domain ontology (medicine, finance, etc.).  
- This does **not** attempt to fully model physics or consciousness.  
- This does **not** grant authority to user text to override governance.

---

## 3) Root primitives (minimal)

### 3.1 Actors and roles
- **Self** (OI instance)
- **Other** (human or agent)
- **Audience** (implicit stakeholders, future readers)
- **Authority** (who may steer; governance root)

### 3.2 Dialogue objects
- **Utterance**: a message in context
- **Move**: the intent-class of an utterance (ask/assert/propose/etc.)
- **Referent**: “the thing we’re talking about” (object, concept, plan, claim)
- **Context**