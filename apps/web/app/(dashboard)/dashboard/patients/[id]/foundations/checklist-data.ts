/**
 * Predefined foundational checklist topics.
 *
 * These represent the core "homework" practitioners assign patients during
 * the 1-3 week lab waiting period. Dr. Laura's methodology emphasizes:
 * foundational nutrition/lifestyle before supplements, and building daily
 * habits that support protocol adherence later.
 */

export interface ChecklistItem {
  id: string;
  topic: string;
  title: string;
  description: string;
  /** Optional resource links or tips */
  resources: string;
  /** Whether the item is selected for assignment */
  selected: boolean;
  /** Custom notes from the practitioner for this item */
  notes: string;
}

export const FOUNDATIONAL_TOPICS: Omit<ChecklistItem, "selected" | "notes">[] = [
  {
    id: "sleep",
    topic: "Sleep",
    title: "Sleep hygiene foundations",
    description:
      "Establish consistent sleep/wake times (within 30 min window, even weekends). " +
      "Create a wind-down routine starting 60-90 min before bed. Remove screens from " +
      "the bedroom. Target 7-9 hours of sleep in a cool, dark room.",
    resources:
      "Track bedtime/wake time and sleep quality (1-10) daily. Note any supplements " +
      "or habits that improve or worsen sleep.",
  },
  {
    id: "hydration",
    topic: "Hydration",
    title: "Daily hydration baseline",
    description:
      "Drink half your body weight in ounces of filtered water daily (e.g., 150 lbs = " +
      "75 oz). Start each morning with 16-20 oz of water before coffee or food. Add a " +
      "pinch of mineral salt or electrolytes if needed.",
    resources:
      "Track daily water intake. Note energy levels and any changes in digestion, skin, " +
      "or headaches as hydration improves.",
  },
  {
    id: "nutrition",
    topic: "Nutrition",
    title: "Nutrition awareness and foundations",
    description:
      "Focus on whole, unprocessed foods. Eat protein at every meal (palm-sized portion). " +
      "Include 2-3 cups of colorful vegetables daily. Minimize added sugars, seed oils, " +
      "and ultra-processed foods. Eat meals at consistent times.",
    resources:
      "Keep a 3-day food journal (what you ate, when, and how you felt 1 hour after). " +
      "Note any foods that consistently cause bloating, fatigue, or discomfort.",
  },
  {
    id: "stress",
    topic: "Stress Management",
    title: "Stress awareness and nervous system support",
    description:
      "Identify your top 3 stressors and rate each (1-10). Practice one daily " +
      "nervous system regulation technique: 5 min of box breathing (inhale 4, hold 4, " +
      "exhale 4, hold 4), a 10-min walk outside, or a brief journaling practice.",
    resources:
      "Track daily stress level (1-10) and which regulation technique you used. Note " +
      "patterns — when stress spikes and what helps bring it down.",
  },
  {
    id: "movement",
    topic: "Movement",
    title: "Daily movement baseline",
    description:
      "Aim for 20-30 minutes of intentional movement daily. This can be walking, yoga, " +
      "stretching, swimming, or any activity you enjoy. Focus on consistency over intensity. " +
      "If you're currently sedentary, start with 10 minutes and build up.",
    resources:
      "Track daily movement — type, duration, and how you felt afterward. Note if " +
      "exercise improves or worsens your energy, sleep, or symptoms.",
  },
  {
    id: "environment",
    topic: "Environment",
    title: "Environmental exposure awareness",
    description:
      "Audit your home for common toxin exposures: switch to non-toxic cleaning products, " +
      "swap out plastic food containers for glass or stainless steel, check personal care " +
      "products for parabens, phthalates, and fragrance. Open windows daily for fresh air.",
    resources:
      "Review product ingredients using EWG's Skin Deep database or Think Dirty app. " +
      "Make one swap per week — don't try to change everything at once.",
  },
  {
    id: "mindset",
    topic: "Mindset",
    title: "Health mindset and goal setting",
    description:
      "Write down your top 3 health goals and why they matter to you. Practice " +
      "gratitude daily — write 3 things you're grateful for each morning. Recognize " +
      "that healing is not linear and small consistent changes compound over time.",
    resources:
      "Journal prompt: What would your life look like if these health issues were " +
      "resolved? What daily habits would that version of you have?",
  },
  {
    id: "digestion",
    topic: "Digestion",
    title: "Digestive foundations",
    description:
      "Eat slowly and chew thoroughly (20-30 chews per bite). Avoid drinking large " +
      "amounts of water with meals (small sips are fine). Eat in a calm, seated " +
      "environment — no eating while driving or working at your desk.",
    resources:
      "Track daily bowel movements (frequency, consistency using the Bristol Stool Chart). " +
      "Note any bloating, gas, or discomfort and which meals preceded it.",
  },
];

/** Create a fresh set of items from the template library, all pre-selected */
export function createDefaultItems(): ChecklistItem[] {
  return FOUNDATIONAL_TOPICS.map((t) => ({
    ...t,
    selected: true,
    notes: "",
  }));
}
