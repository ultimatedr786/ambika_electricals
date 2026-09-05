import type { RewardRule } from "@/types";

export const rewardRules: RewardRule[] = [
  { id: "rl-001", name: "Base earn rate", type: "spend", when: "Customer spends ₹100", then: "Award 10 points", value: 10, enabled: true },
  { id: "rl-002", name: "LED product bonus", type: "product", when: "Customer buys any LED product", then: "Award +20 bonus points", value: 20, enabled: true },
  { id: "rl-003", name: "Bulk LED bulbs", type: "product", when: "Customer buys 5 or more LED bulbs", then: "Award +100 bonus points", value: 100, enabled: true },
  { id: "rl-004", name: "Wires & Cables multiplier", type: "category", when: "Purchase from Wires & Cables", then: "Award 2X points", value: 2, enabled: true },
  { id: "rl-005", name: "Weekend electrical shopping", type: "multiplier", when: "Purchase on Saturday or Sunday", then: "Award 2X points", value: 2, enabled: true },
  { id: "rl-006", name: "First purchase bonus", type: "first_purchase", when: "Customer makes their first purchase", then: "Award 250 bonus points", value: 250, enabled: true },
  { id: "rl-007", name: "Signup bonus", type: "signup", when: "Customer creates an account", then: "Award 100 welcome points", value: 100, enabled: true },
  { id: "rl-008", name: "Referral bonus", type: "referral", when: "A referred friend makes a purchase", then: "Award 200 points", value: 200, enabled: true },
  { id: "rl-009", name: "Birthday bonus", type: "birthday", when: "It's the customer's birthday month", then: "Award 500 points", value: 500, enabled: true },
  { id: "rl-010", name: "Festival campaign bonus", type: "campaign", when: "Festival Electrical Savings is running", then: "Award 3X points", value: 3, enabled: false },
];
