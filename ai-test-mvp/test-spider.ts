import { SpiderAnalyzer } from "./src/analyzers/spider-analyzer.js";

async function main() {
  const spider = new SpiderAnalyzer();
  const repoModel = await spider.analyze({
    baseUrl: "http://localhost:3000",
    maxDepth: 1,
    concurrency: 2
  });

  console.log("=== Routes ===");
  console.log(repoModel.routes);

  console.log("\n=== Pages ===");
  console.log(JSON.stringify(repoModel.pages, null, 2));

  console.log("\n=== Forms ===");
  console.log(JSON.stringify(repoModel.forms, null, 2));

  console.log("\n=== Business Terms ===");
  console.log(repoModel.businessTerms);

  console.log("\n=== Parsed Pages (first one) ===");
  if (repoModel._parsed?.pages[0]) {
    console.log(JSON.stringify(repoModel._parsed.pages[0], null, 2));
  }
}

main().catch(console.error);