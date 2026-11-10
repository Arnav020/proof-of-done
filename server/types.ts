export type CheckSpec =
  | { op: 'text_present'; any: string[] }
  | { op: 'element_present'; element: ElementKind; min?: number }
  | { op: 'mobile_no_horizontal_scroll' }
  | { op: 'load_time_under'; ms: number }
  | { op: 'viewport_meta' }
  | { op: 'images_have_alt' }
  | { op: 'title_contains'; any: string[] };

export const ELEMENT_KINDS = ['form', 'email_input', 'phone_link', 'image', 'button', 'nav', 'footer', 'map'] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

export type Verdict = {
  pass: boolean;
  confidence: number;
  evidence: string;
  source: 'code' | 'ai' | 'guard';
  needsReview: boolean;
  at: string;
};

export type Criterion = {
  id: string;
  title: string;
  description: string;
  kind: 'deterministic' | 'visual' | 'content';
  check?: CheckSpec;
  amount: number;
  verdict?: Verdict;
  paid: boolean;
  refunded?: boolean;
};

export type CaptureRecord = {
  id: string;
  amount: number;
  fee?: number;
  net?: number;
  status: string;
  final: boolean;
  criterionIds: string[];
  at: string;
};

export type MilestoneStatus = 'awaiting_funding' | 'funded' | 'in_review' | 'partially_paid' | 'paid' | 'voided';

export type Milestone = {
  id: string;
  index: number;
  title: string;
  summary: string;
  amount: number;
  startOffsetDays: number;
  durationDays: number;
  dueAt: string;
  status: MilestoneStatus;
  criteria: Criterion[];
  payment: {
    orderId?: string;
    authorizationId?: string;
    authorizedAmount?: number;
    authorizationExpires?: string;
    captured: number;
    captures: CaptureRecord[];
    refunds: { id: string; amount: number; status: string; criterionId: string; at: string }[];
    voidedAt?: string;
  };
  lastInspection?: { url: string; at: string; injectionFlag: boolean; injectionDetail?: string; models?: string[] };
};

export type LedgerEvent = {
  at: string;
  type: 'created' | 'authorized' | 'captured' | 'refunded' | 'voided' | 'inspected' | 'flagged';
  milestoneId?: string;
  amount?: number;
  paypalId?: string;
  status?: string;
  note: string;
};

export type Project = {
  id: string;
  version: 1;
  title: string;
  brief: string;
  clientName: string;
  freelancerName: string;
  currency: 'USD';
  total: number;
  createdAt: string;
  milestones: Milestone[];
  events: LedgerEvent[];
};

export type Signed = { project: Project; sig: string };
