import {
  Leaf, GraduationCap, TrendingUp, Landmark, HeartPulse, Cpu, Scale, Building2, Tag,
  type LucideIcon,
} from "lucide-react";

export const TOPIC_ICON: Record<string, LucideIcon> = {
  Environment: Leaf,
  Education: GraduationCap,
  Economy: TrendingUp,
  Government: Landmark,
  Health: HeartPulse,
  Technology: Cpu,
  Crime: Scale,
  Society: Building2,
};

export const topicIcon = (t: string): LucideIcon => TOPIC_ICON[t] ?? Tag;
