// DỮ LIỆU MẪU – chỉ để xem giao diện, sau này thay bằng Supabase
export type Word = {
  id: number;
  word: string;
  ipa: string;
  pos: string;
  vi: string;
  en: string;
  example: string;
  level: "A2" | "B1" | "B2" | "C1" | "C2";
  topic: string;
  awl?: boolean;
  source?: string;
};

const w = (
  id: number, word: string, ipa: string, pos: string, vi: string, en: string,
  example: string, level: Word["level"], topic: string, awl = false
): Word => ({ id, word, ipa, pos, vi, en, example, level, topic, awl });

export const WORDS: Word[] = [
  w(1, "sustainable", "/səˈsteɪnəbl/", "adj", "bền vững", "able to continue over a long time without damaging the environment", "We need more sustainable sources of energy.", "B2", "Environment", true),
  w(2, "mitigate", "/ˈmɪtɪɡeɪt/", "v", "giảm nhẹ", "to make something less harmful or serious", "Trees help mitigate the effects of climate change.", "C1", "Environment", true),
  w(3, "curriculum", "/kəˈrɪkjələm/", "n", "chương trình giảng dạy", "the subjects taught in a school or course", "Coding should be part of the national curriculum.", "B2", "Education", true),
  w(4, "inflation", "/ɪnˈfleɪʃn/", "n", "lạm phát", "a general increase in prices", "Rising inflation is hurting low-income families.", "B2", "Economy"),
  w(5, "scrutiny", "/ˈskruːtəni/", "n", "sự xem xét kỹ lưỡng", "careful and detailed examination", "The policy came under close scrutiny.", "C1", "Government"),
  w(6, "vulnerable", "/ˈvʌlnərəbl/", "adj", "dễ bị tổn thương", "easily harmed physically or emotionally", "Elderly people are particularly vulnerable.", "B2", "Health"),
  w(7, "innovation", "/ˌɪnəˈveɪʃn/", "n", "sự đổi mới", "a new idea, method or device", "Innovation drives economic growth.", "B2", "Technology", true),
  w(8, "deteriorate", "/dɪˈtɪriəreɪt/", "v", "xấu đi", "to become worse", "Air quality has deteriorated rapidly.", "C1", "Environment"),
  w(9, "pollution", "/pəˈluːʃn/", "n", "ô nhiễm", "damage caused to water, air and land by harmful substances", "Air pollution is a serious problem in big cities.", "B1", "Environment"),
  w(10, "recycle", "/ˌriːˈsaɪkl/", "v", "tái chế", "to process used materials so they can be used again", "We recycle all our plastic bottles.", "B1", "Environment"),
  w(11, "tuition", "/tjuˈɪʃn/", "n", "học phí", "money paid for teaching", "Tuition fees have risen sharply.", "B2", "Education"),
  w(12, "literacy", "/ˈlɪtərəsi/", "n", "khả năng đọc viết", "the ability to read and write", "Digital literacy is essential today.", "B2", "Education", true),
  w(13, "graduate", "/ˈɡrædʒuət/", "n", "người tốt nghiệp", "a person who has completed a degree", "Many graduates struggle to find jobs.", "B1", "Education"),
  w(14, "unemployment", "/ˌʌnɪmˈplɔɪmənt/", "n", "thất nghiệp", "the state of not having a job", "Youth unemployment remains high.", "B1", "Economy"),
  w(15, "subsidy", "/ˈsʌbsədi/", "n", "trợ cấp", "money given by government to help an industry", "Farmers receive a government subsidy.", "C1", "Economy", true),
  w(16, "obesity", "/əʊˈbiːsəti/", "n", "béo phì", "the condition of being very overweight", "Child obesity is rising worldwide.", "B2", "Health"),
  w(17, "epidemic", "/ˌepɪˈdemɪk/", "n", "dịch bệnh", "a disease that spreads quickly among many people", "The epidemic spread across the region.", "C1", "Health"),
  w(18, "nutrition", "/njuˈtrɪʃn/", "n", "dinh dưỡng", "the food necessary for health and growth", "Good nutrition is vital for children.", "B2", "Health"),
  w(19, "algorithm", "/ˈælɡərɪðəm/", "n", "thuật toán", "a set of rules used to solve a problem", "Social media algorithms shape what we see.", "C1", "Technology"),
  w(20, "automation", "/ˌɔːtəˈmeɪʃn/", "n", "tự động hoá", "the use of machines to do work automatically", "Automation may replace many jobs.", "B2", "Technology", true),
  w(21, "device", "/dɪˈvaɪs/", "n", "thiết bị", "a machine or tool made for a purpose", "Most teenagers own a mobile device.", "B1", "Technology"),
  w(22, "crime rate", "/kraɪm reɪt/", "n", "tỷ lệ tội phạm", "the number of crimes in a place over a period", "The crime rate fell last year.", "B1", "Crime"),
  w(23, "deter", "/dɪˈtɜː/", "v", "ngăn cản, răn đe", "to make someone decide not to do something", "Harsh penalties may deter offenders.", "C1", "Crime", true),
  w(24, "urbanisation", "/ˌɜːbənaɪˈzeɪʃn/", "n", "đô thị hoá", "the growth of towns and cities", "Rapid urbanisation puts pressure on housing.", "B2", "Society"),
];

export const DAILY_NEWS = [WORDS[4], WORDS[5], WORDS[1], WORDS[7], WORDS[3]];
export const DAILY_IELTS = [WORDS[0], WORDS[2], WORDS[6], WORDS[3], WORDS[5]];

export const DUE_COUNT = 12;
export const DUE_WORDS = WORDS.slice(0, 6);

export const LEVEL_INFO: Record<string, { title: string; desc: string }> = {
  A2: { title: "A2 – Cơ bản", desc: "Từ rất cơ bản" },
  B1: { title: "B1 – Nền tảng", desc: "Từ cơ bản, ôn lại khi cần" },
  B2: { title: "B2 – Mục tiêu 6.5", desc: "Trọng tâm để đạt band 6.5" },
  C1: { title: "C1 – Hướng tới 7.0", desc: "Từ nâng cao, học thêm dần" },
  C2: { title: "C2 – Thành thạo", desc: "Từ rất nâng cao" },
};

export const levelColor: Record<string, string> = {
  A2: "bg-slate-500/15 text-slate-700 dark:bg-slate-400/20 dark:text-slate-300",
  C2: "bg-pink-500/15 text-pink-700 dark:bg-pink-400/25 dark:text-pink-300",
  B1: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300",
  B2: "bg-sky-500/15 text-sky-700 dark:bg-sky-400/20 dark:text-sky-300",
  C1: "bg-violet-500/15 text-violet-700 dark:bg-violet-400/25 dark:text-violet-300",
};

