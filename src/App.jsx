import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Clipboard, FileText, Image, Loader2, Lock, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const initialForm = {
  productName: "",
  features: "",
  platform: "Amazon",
  tone: "Professional",
  imageFileName: "",
  imageDataUrl: "",
  imagePreview: "",
  documentFileName: "",
  documentText: ""
};

const platforms = ["Amazon", "Etsy", "Shopify", "General"];
const tones = ["Professional", "Friendly", "Luxury", "Fun"];

const emptyResult = {
  title: "",
  description: "",
  bullets: [],
  seo_keywords: { primary: [], secondary: [], long_tail: [] },
  aeo_content: { featured_snippet_answer: "", faq: [] },
  geo_content: { ai_summary: "", structured_attributes: [], citation_ready_sentence: "" }
};

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

function splitFeatures(features) {
  return features
    .split("\n")
    .map((feature) => feature.trim())
    .filter(Boolean);
}

function formatInputText(form) {
  const features = splitFeatures(form.features).map((feature) => `- ${feature}`).join("\n");
  return `Product Name: ${form.productName}
Platform: ${form.platform}
Tone: ${form.tone}
Key Features:
${features}
Document Content${form.documentText ? " (provided)" : " (if provided)"}: ${form.documentText || "None"}

Return valid JSON only with this exact shape:
{
  "title": "string",
  "description": "string",
  "bullets": ["string", "string", "string", "string", "string"],
  "seo_keywords": {
    "primary": ["string"],
    "secondary": ["string"],
    "long_tail": ["string"]
  },
  "aeo_content": {
    "featured_snippet_answer": "string",
    "faq": [
      { "question": "string", "answer": "string" },
      { "question": "string", "answer": "string" },
      { "question": "string", "answer": "string" }
    ]
  },
  "geo_content": {
    "ai_summary": "string",
    "structured_attributes": [
      { "label": "string", "value": "string" }
    ],
    "citation_ready_sentence": "string"
  }
}`;
}

function normalizeResult(value) {
  return {
    ...emptyResult,
    ...value,
    seo_keywords: { ...emptyResult.seo_keywords, ...(value?.seo_keywords || {}) },
    aeo_content: { ...emptyResult.aeo_content, ...(value?.aeo_content || {}) },
    geo_content: { ...emptyResult.geo_content, ...(value?.geo_content || {}) }
  };
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractDocumentText(file) {
  if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
    return file.text();
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    pages.push(textContent.items.map((item) => item.str).join(" "));
  }

  return pages.join("\n\n").trim();
}

function FieldError({ children }) {
  if (!children) return null;
  return <p className="mt-2 text-sm text-red-600">{children}</p>;
}

function CopyButton({ value, label = "Copy" }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex min-h-10 items-center gap-2 rounded-md border border-indigo-200 px-3 text-sm font-medium text-indigo-700 transition hover:bg-indigo-50"
    >
      <Clipboard size={16} />
      {copied ? "Copied" : label}
    </button>
  );
}

function Tag({ children }) {
  return (
    <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-800">
      {children}
    </span>
  );
}

function SectionHeader({ title, children }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      {children}
    </div>
  );
}

export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReadingDocument, setIsReadingDocument] = useState(false);
  const [apiError, setApiError] = useState("");
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState("listing");
  const outputRef = useRef(null);

  const allKeywords = useMemo(() => {
    if (!result) return "";
    const keywordGroups = result.seo_keywords || {};
    return [
      ...(keywordGroups.primary || []),
      ...(keywordGroups.secondary || []),
      ...(keywordGroups.long_tail || [])
    ].join(", ");
  }, [result]);

  useEffect(() => {
    if (result && outputRef.current) {
      outputRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result]);

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
  }

  function validate() {
    const nextErrors = {};
    if (!apiKey.trim()) nextErrors.apiKey = "Paste your OpenAI API key to generate a listing.";
    if (!form.productName.trim()) nextErrors.productName = "Product name is required.";
    if (!form.features.trim()) nextErrors.features = "Add at least one product feature.";
    if (!form.platform) nextErrors.platform = "Choose a target platform.";
    if (!form.tone) nextErrors.tone = "Choose a tone.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setErrors((current) => ({ ...current, image: "Upload a JPG or PNG image." }));
      return;
    }

    const dataUrl = await fileToDataUrl(file);
    setForm((current) => ({
      ...current,
      imageFileName: file.name,
      imageDataUrl: dataUrl,
      imagePreview: dataUrl
    }));
    setErrors((current) => ({ ...current, image: "" }));
  }

  async function handleDocumentUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const isText = file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt");
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!isText && !isPdf) {
      setErrors((current) => ({ ...current, document: "Upload a PDF or TXT document." }));
      return;
    }

    setIsReadingDocument(true);
    setErrors((current) => ({ ...current, document: "" }));

    try {
      const text = await extractDocumentText(file);
      setForm((current) => ({
        ...current,
        documentFileName: file.name,
        documentText: text
      }));
    } catch {
      setErrors((current) => ({ ...current, document: "Could not read that document. Try a different PDF or TXT file." }));
    } finally {
      setIsReadingDocument(false);
    }
  }

  function getFriendlyApiError(status, fallback) {
    if (status === 401) return "OpenAI rejected the API key. Check the key and try again.";
    if (status === 429) return "OpenAI rate limits were reached. Wait a moment, then try again.";
    if (status >= 500) return "OpenAI is having server trouble. Please try again shortly.";
    return fallback || "Something went wrong while generating the listing.";
  }

  async function generateListing() {
    if (!validate()) return;

    setIsGenerating(true);
    setApiError("");

    const content = [{ type: "text", text: formatInputText(form) }];
    if (form.imageDataUrl) {
      content.push({
        type: "image_url",
        image_url: {
          url: form.imageDataUrl
        }
      });
    }

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are an expert eCommerce copywriter and SEO/AEO/GEO strategist. Your job is to generate compelling, platform-optimized product listings and keyword sets from the inputs provided. Always respond with valid JSON only. No markdown, no explanation, no code fences."
            },
            { role: "user", content }
          ]
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(getFriendlyApiError(response.status, payload?.error?.message));
      }

      const rawContent = payload?.choices?.[0]?.message?.content;
      if (!rawContent) throw new Error("OpenAI returned an empty response.");
      setResult(normalizeResult(JSON.parse(rawContent)));
      setActiveTab("listing");
    } catch (error) {
      setApiError(error.message || "Something went wrong while generating the listing.");
    } finally {
      setIsGenerating(false);
    }
  }

  function startOver() {
    setForm(initialForm);
    setErrors({});
    setApiError("");
    setResult(null);
    setActiveTab("listing");
  }

  const tabs = [
    { id: "listing", label: "Listing Copy" },
    { id: "seo", label: "SEO Keywords" },
    { id: "aeo", label: "AEO" },
    { id: "geo", label: "GEO" }
  ];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white px-3 py-1 text-sm font-medium text-indigo-700 shadow-sm">
            <Sparkles size={16} />
            Product Description Writer
          </div>
          <h1 className="text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl">
            Generate optimized product listings from your raw inputs.
          </h1>
        </header>

        <section className="mb-6 rounded-lg bg-white p-5 shadow-soft">
          <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900" htmlFor="apiKey">
            <Lock size={16} className="text-indigo-600" />
            OpenAI API Key
          </label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              setErrors((current) => ({ ...current, apiKey: "" }));
            }}
            className="min-h-11 w-full rounded-md border border-slate-200 px-3 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            placeholder="sk-..."
          />
          <p className="mt-2 text-sm text-slate-500">Your key is never stored or sent anywhere except directly to OpenAI.</p>
          <FieldError>{errors.apiKey}</FieldError>
        </section>

        <form
          className="rounded-lg bg-white p-5 shadow-soft"
          onSubmit={(event) => {
            event.preventDefault();
            generateListing();
          }}
        >
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900" htmlFor="productName">
                Product Name
              </label>
              <input
                id="productName"
                value={form.productName}
                onChange={(event) => updateField("productName", event.target.value)}
                className="min-h-11 w-full rounded-md border border-slate-200 px-3 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                placeholder="Acme insulated stainless steel bottle"
              />
              <FieldError>{errors.productName}</FieldError>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-900" htmlFor="features">
                Key Features / Bullet Points
              </label>
              <textarea
                id="features"
                value={form.features}
                onChange={(event) => updateField("features", event.target.value)}
                rows={6}
                className="w-full resize-y rounded-md border border-slate-200 px-3 py-3 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                placeholder={"Keeps drinks cold for 24 hours\nLeakproof lid\nBPA-free materials"}
              />
              <FieldError>{errors.features}</FieldError>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900" htmlFor="platform">
                  Target Platform
                </label>
                <select
                  id="platform"
                  value={form.platform}
                  onChange={(event) => updateField("platform", event.target.value)}
                  className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                >
                  {platforms.map((platform) => (
                    <option key={platform}>{platform}</option>
                  ))}
                </select>
                <FieldError>{errors.platform}</FieldError>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900" htmlFor="tone">
                  Tone
                </label>
                <select
                  id="tone"
                  value={form.tone}
                  onChange={(event) => updateField("tone", event.target.value)}
                  className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                >
                  {tones.map((tone) => (
                    <option key={tone}>{tone}</option>
                  ))}
                </select>
                <FieldError>{errors.tone}</FieldError>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900" htmlFor="imageUpload">
                  <Image size={16} className="text-indigo-600" />
                  Image Upload
                </label>
                <input
                  id="imageUpload"
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleImageUpload}
                  className="block w-full text-sm text-slate-700 file:mr-4 file:min-h-10 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                />
                <FieldError>{errors.image}</FieldError>
                {form.imagePreview && (
                  <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
                    <img src={form.imagePreview} alt={form.imageFileName} className="max-h-64 w-full object-contain bg-slate-100" />
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900" htmlFor="documentUpload">
                  <FileText size={16} className="text-indigo-600" />
                  Document Upload
                </label>
                <input
                  id="documentUpload"
                  type="file"
                  accept=".pdf,.txt,application/pdf,text/plain"
                  onChange={handleDocumentUpload}
                  className="block w-full text-sm text-slate-700 file:mr-4 file:min-h-10 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                />
                <FieldError>{errors.document}</FieldError>
                {isReadingDocument && <p className="mt-2 text-sm text-slate-500">Extracting document text...</p>}
                {form.documentFileName && !isReadingDocument && (
                  <p className="mt-2 text-sm text-slate-600">
                    Loaded {form.documentFileName} ({form.documentText.length.toLocaleString()} characters)
                  </p>
                )}
              </div>
            </div>
          </div>

          {apiError && (
            <div className="mt-5 flex gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <AlertCircle size={18} className="mt-0.5 flex-none" />
              <p>{apiError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isGenerating || isReadingDocument}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-5 font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300 sm:w-auto"
          >
            {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {isGenerating ? "Generating your listing..." : "Generate Description"}
          </button>
        </form>

        {result && (
          <section ref={outputRef} className="mt-8 rounded-lg bg-white p-5 shadow-soft">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="mb-2 inline-flex rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700">
                  Your {form.platform} Listing
                </span>
                <h2 className="text-2xl font-bold text-slate-950">Generated Output</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={generateListing}
                  disabled={isGenerating}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md border border-indigo-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                >
                  <RefreshCw size={16} />
                  Regenerate
                </button>
                <button
                  type="button"
                  onClick={startOver}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Trash2 size={16} />
                  Start Over
                </button>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-1 sm:grid-cols-4">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={classNames(
                    "min-h-10 rounded-md px-3 text-sm font-semibold transition",
                    activeTab === tab.id ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-950"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "listing" && (
              <div className="space-y-6">
                <div>
                  <SectionHeader title="Generated Title">
                    <CopyButton value={result.title} />
                  </SectionHeader>
                  <p className="text-xl font-semibold text-slate-950">{result.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{result.title.length} characters</p>
                </div>
                <div>
                  <SectionHeader title="Description">
                    <CopyButton value={result.description} />
                  </SectionHeader>
                  <p className="leading-7 text-slate-700">{result.description}</p>
                </div>
                <div>
                  <SectionHeader title="Bullet Points">
                    <CopyButton value={(result.bullets || []).join("\n")} />
                  </SectionHeader>
                  <ul className="space-y-2">
                    {(result.bullets || []).map((bullet, index) => (
                      <li key={`${bullet}-${index}`} className="rounded-md border border-slate-100 bg-slate-50 p-3 text-slate-700">
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {activeTab === "seo" && (
              <div className="space-y-6">
                <SectionHeader title="SEO Keywords">
                  <CopyButton value={allKeywords} label="Copy All" />
                </SectionHeader>
                {[
                  ["Primary", result.seo_keywords.primary],
                  ["Secondary", result.seo_keywords.secondary],
                  ["Long-tail", result.seo_keywords.long_tail]
                ].map(([label, keywords]) => (
                  <div key={label}>
                    <h4 className="mb-3 text-sm font-semibold uppercase tracking-normal text-slate-500">{label}</h4>
                    <div className="flex flex-wrap gap-2">
                      {(keywords || []).map((keyword) => (
                        <Tag key={keyword}>{keyword}</Tag>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "aeo" && (
              <div className="space-y-6">
                <SectionHeader title="Answer Engine Optimization (AEO)" />
                <div>
                  <h4 className="mb-2 font-semibold text-slate-950">Featured Snippet Answer</h4>
                  <p className="leading-7 text-slate-700">{result.aeo_content.featured_snippet_answer}</p>
                </div>
                <div>
                  <h4 className="mb-3 font-semibold text-slate-950">FAQ</h4>
                  <div className="space-y-3">
                    {(result.aeo_content.faq || []).map((item, index) => (
                      <div key={`${item.question}-${index}`} className="rounded-md border border-slate-100 bg-slate-50 p-4">
                        <p className="font-semibold text-slate-950">{item.question}</p>
                        <p className="mt-2 leading-7 text-slate-700">{item.answer}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="rounded-md bg-indigo-50 p-3 text-sm text-indigo-900">
                  AEO content helps your product appear in AI-generated answer boxes, Google SGE, and voice search results.
                </p>
              </div>
            )}

            {activeTab === "geo" && (
              <div className="space-y-6">
                <SectionHeader title="Generative Engine Optimization (GEO)" />
                <div>
                  <h4 className="mb-2 font-semibold text-slate-950">AI Summary</h4>
                  <p className="leading-7 text-slate-700">{result.geo_content.ai_summary}</p>
                </div>
                <div>
                  <h4 className="mb-3 font-semibold text-slate-950">Structured Attributes</h4>
                  <div className="overflow-hidden rounded-md border border-slate-200">
                    <table className="w-full border-collapse text-left text-sm">
                      <tbody>
                        {(result.geo_content.structured_attributes || []).map((attribute, index) => (
                          <tr key={`${attribute.label}-${index}`} className="border-b border-slate-100 last:border-0">
                            <th className="w-1/3 bg-slate-50 px-3 py-3 font-semibold text-slate-700">{attribute.label}</th>
                            <td className="px-3 py-3 text-slate-700">{attribute.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <h4 className="mb-2 font-semibold text-slate-950">Citation-Ready Sentence</h4>
                  <p className="leading-7 text-slate-700">{result.geo_content.citation_ready_sentence}</p>
                </div>
                <p className="rounded-md bg-indigo-50 p-3 text-sm text-indigo-900">
                  GEO content is written to be cited and surfaced by generative AI tools like ChatGPT, Perplexity, and Claude when users ask product-related questions.
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
