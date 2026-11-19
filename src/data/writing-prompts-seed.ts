import type { WritingSubType, WritingTaskType } from "@/lib/writing-frameworks";

export type SeedWritingPrompt = {
  task_type: WritingTaskType;
  sub_type: WritingSubType;
  title: string;
  source_name: string;
  topic: string;
  prompt_text: string;
  image_data_url: string | null;
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
    image_data_url: null,
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
    image_data_url: null,
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
    image_data_url: null,
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
    image_data_url: null,
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
    image_data_url: null,
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
    image_data_url: null,
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
    image_data_url: null,
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
    image_data_url: null,
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
    image_data_url: null,
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
    image_data_url: null,
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
    image_data_url: null,
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
    image_data_url: null,
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
    image_data_url: null,
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
    image_data_url: null,
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
    image_data_url: null,
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
    image_data_url: null,
    chart_notes: null,
  },

  // ===================== TASK 1: ĐỀ CAMBRIDGE IELTS THẬT KÈM HÌNH SVG =====================
  {
    task_type: "task1",
    sub_type: "line_graph",
    title: "Task 1 (Line Graph): Car ownership in Britain (1971–2007)",
    source_name: "Cambridge IELTS",
    topic: "Society",
    prompt_text:
      "The graph below gives information about car ownership in Britain from 1971 to 2007. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
    image_data_url: "/writing-charts/car-ownership-britain.svg",
    chart_notes:
      "No car: ~50% (1971) -> ~25% (2007). 1 car: ~44% (1971) -> ~44% (2007). 2 cars: ~7% (1971) -> ~26% (2007). 3 or more cars: ~2% (1971) -> ~5% (2007).",
  },
  {
    task_type: "task1",
    sub_type: "pie_chart",
    title: "Task 1 (Pie Chart): Energy production in France (1995 vs 2005)",
    source_name: "Cambridge IELTS",
    topic: "Environment",
    prompt_text:
      "The pie charts below show the comparison of different kinds of energy production in France in two years. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
    image_data_url: "/writing-charts/energy-production-france.svg",
    chart_notes:
      "1995: Coal 29.80%, Gas 29.63%, Petrol 29.27%, Nuclear 6.40%, Other 4.90%. 2005: Coal 30.93%, Gas 30.31%, Petrol 19.55%, Nuclear 10.10%, Other 9.10%.",
  },
  {
    task_type: "task1",
    sub_type: "pie_chart",
    title: "Task 1 (Pie Chart): Average percentages of three nutrients in typical meals",
    source_name: "Cambridge IELTS 14 Test 1",
    topic: "Health",
    prompt_text:
      "The charts below show the average percentages in typical meals of three types of nutrients, all of which may be unhealthy if eaten too much. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
    image_data_url: "/writing-charts/nutrients-typical-meals.svg",
    chart_notes:
      "Sodium: Breakfast 14%, Lunch 29%, Dinner 43%, Snacks 14%. Saturated fat: Breakfast 16%, Lunch 26%, Dinner 37%, Snacks 21%. Added sugar: Breakfast 16%, Lunch 19%, Dinner 23%, Snacks 42%.",
  },
  {
    task_type: "task1",
    sub_type: "table",
    title: "Task 1 (Table): Consumer spending in five countries (2002)",
    source_name: "Cambridge IELTS 7 Test 2",
    topic: "Economy",
    prompt_text:
      "The table below gives information on consumer spending on different items in five different countries in 2002. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
    image_data_url: "/writing-charts/consumer-spending-2002.svg",
    chart_notes:
      "Ireland (Food/Drinks/Tobacco 28.91%, Clothing/Footwear 6.43%, Leisure/Education 2.21%); Italy (16.36%, 9.00%, 3.20%); Spain (18.80%, 6.51%, 1.98%); Sweden (15.77%, 5.40%, 3.22%); Turkey (32.14%, 6.63%, 4.35%).",
  },
  {
    task_type: "task1",
    sub_type: "table",
    title: "Task 1 (Table): Families living in poverty in Australia (1999)",
    source_name: "Cambridge IELTS 4 Test 3",
    topic: "Society",
    prompt_text:
      "The table below shows the proportion of different categories of families living in poverty in Australia in 1999. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
    image_data_url: "/writing-charts/poverty-australia-1999.svg",
    chart_notes:
      "Single aged person 6% (54,000); Aged couple 4% (48,000); Single, no children 19% (359,000); Couple, no children 7% (211,000); Sole parent 21% (232,000); Couple with children 12% (933,000); All households 11% (1,837,000).",
  },
  {
    task_type: "task1",
    sub_type: "bar_chart",
    title: "Task 1 (Bar Chart): Money per week spent on fast foods in Britain",
    source_name: "Cambridge IELTS 3",
    topic: "Economy",
    prompt_text:
      "The chart below shows the amount of money per week spent on fast foods in Britain. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
    image_data_url: "/writing-charts/fast-foods-britain.svg",
    chart_notes:
      "High income: Hamburgers 43p, Fish & chips ~17p, Pizza ~18p. Average income: Hamburgers 33p, Fish & chips 24p, Pizza 11p. Low income: Fish & chips ~17p, Hamburgers 14p, Pizza 7p.",
  },
  {
    task_type: "task1",
    sub_type: "process",
    title: "Task 1 (Process): How electricity is generated in a hydroelectric power station",
    source_name: "Cambridge IELTS 14 Test 3",
    topic: "Science",
    prompt_text:
      "The diagram below shows how electricity is generated in a hydroelectric power station. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
    image_data_url: "/writing-charts/hydroelectric-power-station.svg",
    chart_notes:
      "Day: River water stored in high-level reservoir behind dam flows through open intake to reversible turbines -> spins generator -> electricity sent via power lines to national grid; water collects in low-level reservoir. Night: intake closed, reversible turbines pump water from low-level reservoir back up to high-level reservoir.",
  },
];
