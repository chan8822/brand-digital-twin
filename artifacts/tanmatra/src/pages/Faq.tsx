import { type MetaFunction } from "react-router";

export function meta(): ReturnType<MetaFunction> {
  return [
    { title: "FAQ | Tanmatra" },
    {
      "script:ld+json": {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "TODO(founder): Add real FAQ question here",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "TODO(founder): Add real FAQ answer here"
            }
          }
        ]
      }
    }
  ];
}

export default function Faq() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl text-white font-serif mb-6">Frequently Asked Questions</h1>
      <div className="space-y-4">
        {/* TODO(founder): replace these placeholders with real FAQ content once available from site/data sources. do not invent data. */}
        <h2 className="text-xl text-white">TODO(founder): Add Question Title</h2>
        <p className="text-clinical-zinc">TODO(founder): Add Answer Text</p>
      </div>
    </div>
  );
}
