import type { WritingSubType, WritingTaskType } from "@/lib/writing-frameworks";

export type SeedWritingPrompt = {
  task_type: WritingTaskType;
  sub_type: WritingSubType;
  title: string;
  source_name: string;
  topic: string;
  prompt_text: string;
  chart_notes: string | null;
};

export const WRITING_PROMPTS_SEED: SeedWritingPrompt[] = [
  // ===================== TASK 2: OPINION (4 đề) =====================
  {
    task_type: "task2",
    sub_type: "opinion",
    title: "Task 2 (Opinion): AI replacing human jobs vs creating opportunities",
    source_name: "IELTS Actual Test 2024",
    topic: "Technology",
    prompt_text:
      "Artificial intelligence is increasingly replacing human workers in many industries. Some people believe this will lead to widespread unemployment and social inequality, while others argue it will create new opportunities and improve living standards. To what extent do you agree or disagree?",
    chart_notes: null,
  },
  {
    task_type: "task2",
    sub_type: "opinion",
    title: "Task 2 (Opinion): Free university education for all students",
    source_name: "Cambridge IELTS 18",
    topic: "Education",
    prompt_text:
      "Some people think that university education should be free for all students regardless of their financial background, whereas others believe students should pay for their own higher education. To what extent do you agree or disagree?",
    chart_notes: null,
  },
  {
    task_type: "task2",
    sub_type: "opinion",
    title: "Task 2 (Opinion): Environmental tax on flights & private vehicles",
    source_name: "IELTS Actual Test 2025",
    topic: "Environment",
    prompt_text:
      "The best way to solve the world's environmental problems is to increase the cost of fuel for cars and other vehicles. To what extent do you agree or disagree with this statement?",
    chart_notes: null,
  },
  {
    task_type: "task2",
    sub_type: "opinion",
    title: "Task 2 (Opinion): Remote work as a permanent norm",
    source_name: "IELTS Actual Test 2024",
    topic: "Work",
    prompt_text:
      "Many companies now allow employees to work from home permanently. Some people believe this trend benefits both workers and employers, while others think it harms teamwork and company culture. To what extent do you agree or disagree?",
    chart_notes: null,
  },

  // ===================== TASK 2: DISCUSSION (4 đề) =====================
  {
    task_type: "task2",
    sub_type: "discussion",
    title: "Task 2 (Discussion): Government spending on public health vs sports",
    source_name: "Cambridge IELTS 17",
    topic: "Health",
    prompt_text:
      "Some people say that the government should invest more money in promoting a healthy lifestyle to prevent illness, while others believe it is better to spend more on treating people who are already sick. Discuss both views and give your own opinion.",
    chart_notes: null,
  },
  {
    task_type: "task2",
    sub_type: "discussion",
    title: "Task 2 (Discussion): Strict punishment vs rehabilitation for criminals",
    source_name: "Cambridge IELTS 16",
    topic: "Crime",
    prompt_text:
      "Some people think that the best way to reduce crime is to give longer prison sentences, while others believe there are better alternative ways of reducing crime, such as education and job training. Discuss both views and give your opinion.",
    chart_notes: null,
  },
  {
    task_type: "task2",
    sub_type: "discussion",
    title: "Task 2 (Discussion): Preserving local culture vs globalization",
    source_name: "IELTS Actual Test 2024",
    topic: "Culture",
    prompt_text:
      "As global communication becomes easier, many people worry that local traditions and languages are disappearing. Some argue governments should actively protect traditional culture, while others think cultural change is natural and beneficial. Discuss both views and give your own opinion.",
    chart_notes: null,
  },
  {
    task_type: "task2",
    sub_type: "discussion",
    title: "Task 2 (Discussion): News consumption via social media vs traditional press",
    source_name: "Cambridge IELTS 18",
    topic: "Media",
    prompt_text:
      "Nowadays, many people get their news from social media rather than traditional newspapers and television. Some believe this is a positive development, while others think it spreads misinformation. Discuss both views and give your own opinion.",
    chart_notes: null,
  },

  // ===================== TASK 2: PROBLEM & SOLUTION (4 đề) =====================
  {
    task_type: "task2",
    sub_type: "problem_solution",
    title: "Task 2 (Problem/Solution): Urban traffic congestion & air quality",
    source_name: "Cambridge IELTS 17",
    topic: "Environment",
    prompt_text:
      "In many major cities around the world, traffic congestion and air pollution have become serious problems. What are the main causes of this issue, and what measures can governments and individuals take to address it?",
    chart_notes: null,
  },
  {
    task_type: "task2",
    sub_type: "problem_solution",
    title: "Task 2 (Problem/Solution): Youth mental health & social media pressure",
    source_name: "IELTS Actual Test 2025",
    topic: "Society",
    prompt_text:
      "Young people today are experiencing higher levels of stress and anxiety than previous generations. What are the causes of this trend, and what solutions can help improve young people's mental well-being?",
    chart_notes: null,
  },
  {
    task_type: "task2",
    sub_type: "problem_solution",
    title: "Task 2 (Problem/Solution): Plastic waste & throwaway consumer culture",
    source_name: "Cambridge IELTS 18",
    topic: "Environment",
    prompt_text:
      "Nowadays, people produce far more household waste, especially plastic packaging, than in the past. Why is this happening, and what can be done to reduce the amount of waste we create?",
    chart_notes: null,
  },
  {
    task_type: "task2",
    sub_type: "problem_solution",
    title: "Task 2 (Problem/Solution): Aging population & workforce shortage",
    source_name: "IELTS Actual Test 2024",
    topic: "Economy",
    prompt_text:
      "In many developed countries, the proportion of elderly people is increasing rapidly while the working-age population is shrinking. What problems does this cause, and how can societies prepare for this demographic shift?",
    chart_notes: null,
  },

  // ===================== TASK 2: TWO-PART QUESTION (4 đề) =====================
  {
    task_type: "task2",
    sub_type: "two_part",
    title: "Task 2 (Two-Part): Rise of international tourism in developing nations",
    source_name: "Cambridge IELTS 16",
    topic: "Travel",
    prompt_text:
      "International tourism has grown significantly in many developing countries over the last few decades. Why has this happened, and do the economic benefits outweigh the environmental and cultural drawbacks?",
    chart_notes: null,
  },
  {
    task_type: "task2",
    sub_type: "two_part",
    title: "Task 2 (Two-Part): Delaying parenthood until later in life",
    source_name: "Cambridge IELTS 17",
    topic: "Society",
    prompt_text:
      "In many countries, people are choosing to have children later in life than in the past. What are the reasons for this trend, and is it a positive or negative development for society?",
    chart_notes: null,
  },
  {
    task_type: "task2",
    sub_type: "two_part",
    title: "Task 2 (Two-Part): Space exploration funding vs domestic needs",
    source_name: "IELTS Actual Test 2024",
    topic: "Science",
    prompt_text:
      "Some countries spend billions of dollars on space exploration programs. Why do governments invest so heavily in space research, and should this money be spent on solving problems on Earth instead?",
    chart_notes: null,
  },
  {
    task_type: "task2",
    sub_type: "two_part",
    title: "Task 2 (Two-Part): Cashless society & digital payments",
    source_name: "IELTS Actual Test 2025",
    topic: "Economy",
    prompt_text:
      "Fewer people are using cash to pay for goods and services, preferring digital payments instead. What are the reasons for this shift, and do its advantages outweigh its disadvantages?",
    chart_notes: null,
  },

  // ===================== TASK 1 (8 đề đủ 7 dạng) =====================
  {
    task_type: "task1",
    sub_type: "line_graph",
    title: "Task 1 (Line Graph): Renewable vs fossil fuel electricity (2000–2025)",
    source_name: "Cambridge IELTS 18",
    topic: "Environment",
    prompt_text:
      "The line graph below shows the percentage of electricity generated from four different sources (coal, natural gas, solar, and wind) in a European country between 2000 and 2025. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
    chart_notes:
      "Coal: 48% (2000) -> 35% (2010) -> 18% (2020) -> 8% (2025). Natural gas: 32% (2000) -> 38% (2010) -> 30% (2020) -> 22% (2025). Wind: 5% (2000) -> 14% (2010) -> 28% (2020) -> 38% (2025). Solar: 2% (2000) -> 8% (2010) -> 20% (2020) -> 30% (2025).",
  },
  {
    task_type: "task1",
    sub_type: "bar_chart",
    title: "Task 1 (Bar Chart): Household weekly spending by category (2010 vs 2022)",
    source_name: "Cambridge IELTS 17",
    topic: "Economy",
    prompt_text:
      "The bar chart compares the average weekly household expenditure on five categories (housing, food, transport, healthcare, and entertainment) in two years: 2010 and 2022. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
    chart_notes:
      "Housing: $240 (2010) -> $360 (2022). Food: $150 -> $190. Transport: $110 -> $135. Healthcare: $65 -> $115. Entertainment: $90 -> $75.",
  },
  {
    task_type: "task1",
    sub_type: "pie_chart",
    title: "Task 1 (Pie Chart): University graduates' career destinations (2015 vs 2024)",
    source_name: "IELTS Actual Test 2024",
    topic: "Education",
    prompt_text:
      "The two pie charts illustrate the destinations of graduates from a UK university in 2015 and 2024. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
    chart_notes:
      "2015: Full-time employment 58%, Further study 18%, Part-time work 12%, Unemployed 8%, Volunteer/Other 4%. 2024: Full-time employment 52%, Further study 24%, Part-time work 14%, Unemployed 6%, Volunteer/Other 4%.",
  },
  {
    task_type: "task1",
    sub_type: "table",
    title: "Task 1 (Table): Underground railway systems in 5 major cities",
    source_name: "Cambridge IELTS 16",
    topic: "Society",
    prompt_text:
      "The table gives information about the underground railway networks in five major cities (London, Paris, Tokyo, Seoul, and New York), including opening year, route length (km), and annual passengers (millions). Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
    chart_notes:
      "London: opened 1863, 402 km, 1,350M passengers/yr. Paris: 1900, 226 km, 1,520M. New York: 1904, 399 km, 1,700M. Tokyo: 1927, 304 km, 3,460M. Seoul: 1974, 327 km, 2,850M.",
  },
  {
    task_type: "task1",
    sub_type: "process",
    title: "Task 1 (Process): Recycling plastic bottles into polyester fabric",
    source_name: "Cambridge IELTS 17",
    topic: "Environment",
    prompt_text:
      "The diagram illustrates the linear process by which used plastic bottles are recycled and manufactured into polyester clothing. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
    chart_notes:
      "8 stages: (1) Collection from recycling bins -> (2) Sorting by colour & plastic type -> (3) Washing & removing labels -> (4) Shredding into small plastic flakes -> (5) Heating & melting at 260°C -> (6) Spinning into polyester yarn -> (7) Weaving yarn into fabric rolls -> (8) Cutting & sewing into garments.",
  },
  {
    task_type: "task1",
    sub_type: "map",
    title: "Task 1 (Map): Redevelopment of Riverside Park (2005 vs Present)",
    source_name: "Cambridge IELTS 18",
    topic: "Society",
    prompt_text:
      "The two maps show the layout of Riverside Park in 2005 and its current layout after redevelopment. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
    chart_notes:
      "2005: Open grassland in the center, small pond in the north, 2 tennis courts in the east, car park in the southwest, wooden footbridge over the river. Present: Pond expanded into a boating lake; tennis courts replaced by an indoor sports centre; cycling track added around the perimeter; café built near the north entrance; car park doubled in size; footbridge widened.",
  },
  {
    task_type: "task1",
    sub_type: "mixed",
    title: "Task 1 (Mixed): Global smartphone sales & market share by brand",
    source_name: "IELTS Actual Test 2025",
    topic: "Technology",
    prompt_text:
      "The line graph shows total global smartphone sales (in millions of units) from 2018 to 2024, while the pie chart illustrates the market share of leading brands in 2024. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
    chart_notes:
      "Total sales: 1,400M (2018) -> 1,350M (2020) -> 1,430M (2022) -> 1,510M (2024). 2024 Market share: Brand A 23%, Brand B 21%, Brand C 14%, Brand D 11%, Others 31%.",
  },
  {
    task_type: "task1",
    sub_type: "bar_chart",
    title: "Task 1 (Bar Chart): Daily time spent on digital devices by age group",
    source_name: "IELTS Actual Test 2024",
    topic: "Technology",
    prompt_text:
      "The bar chart shows the average number of hours per day that people in four age groups (13–17, 18–34, 35–54, and 55+) spend on smartphones, laptops, and television. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
    chart_notes:
      "13–17: Smartphone 4.8h, Laptop 2.1h, TV 1.2h. 18–34: Smartphone 4.2h, Laptop 3.9h, TV 1.5h. 35–54: Smartphone 2.6h, Laptop 3.4h, TV 2.7h. 55+: Smartphone 1.3h, Laptop 1.5h, TV 4.1h.",
  },
];
