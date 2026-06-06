import {PinoLogger} from './observability';

export interface LandingPageAuditResult {
  url: string;
  hasJsonLd: boolean;
  hasProductSchema: boolean;
  totalImages: number;
  imagesMissingAlt: number;
  missingAltSources: string[];
  issues: string[];
}

export interface MerchantFeedAuditResult {
  productId: string;
  title: string;
  hasGtin: boolean;
  hasShipping: boolean;
  currencyMatch: boolean;
  issues: string[];
}

export class GeoSeoAuditor {
  private readonly logger: PinoLogger;

  constructor(logger?: PinoLogger) {
    this.logger = logger || new PinoLogger();
  }

  /**
   * Audits a landing page HTML for SEO and AI/RAG readiness.
   */
  async auditLandingPage(url: string, htmlContent?: string): Promise<LandingPageAuditResult> {
    this.logger.info('Auditing landing page', {url});
    
    // Simulate fetching HTML if not provided
    const html = htmlContent || this.getMockHtmlForUrl(url);

    const issues: string[] = [];
    
    // 1. JSON-LD checks
    const jsonLdRegex = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    let hasJsonLd = false;
    let hasProductSchema = false;

    while ((match = jsonLdRegex.exec(html)) !== null) {
      hasJsonLd = true;
      const jsonContent = match[1];
      try {
        if (jsonContent.includes('"Product"') || jsonContent.includes("'Product'")) {
          hasProductSchema = true;
        }
      } catch (e) {
        // Ignore JSON parse error in regex sweep
      }
    }

    if (!hasJsonLd) {
      issues.push('Missing JSON-LD structured data script.');
    } else if (!hasProductSchema) {
      issues.push('JSON-LD structured data exists but lacks standard Product schema.');
    }

    // 2. Multimodal image alt tag checks
    const imgRegex = /<img\s+([^>]*?)>/gi;
    let imgMatch;
    let totalImages = 0;
    let imagesMissingAlt = 0;
    const missingAltSources: string[] = [];

    while ((imgMatch = imgRegex.exec(html)) !== null) {
      totalImages++;
      const attrs = imgMatch[1];
      const srcMatch = /src=["']([^"']+)["']/i.exec(attrs);
      const src = srcMatch ? srcMatch[1] : 'unknown-src';
      
      const altMatch = /alt=["']([^"']*)["']/i.exec(attrs);
      if (!altMatch || altMatch[1].trim() === '') {
        imagesMissingAlt++;
        missingAltSources.push(src);
      }
    }

    if (imagesMissingAlt > 0) {
      issues.push(`Found ${imagesMissingAlt} image(s) missing descriptive alt attributes.`);
    }

    return {
      url,
      hasJsonLd,
      hasProductSchema,
      totalImages,
      imagesMissingAlt,
      missingAltSources,
      issues,
    };
  }

  /**
   * Audits Google Merchant Center feed product items for Conversational Search readiness.
   */
  auditMerchantFeed(products: any[], targetCurrency: string = 'USD'): MerchantFeedAuditResult[] {
    this.logger.info('Auditing Merchant Center feed', {productCount: products.length, targetCurrency});
    const results: MerchantFeedAuditResult[] = [];

    for (const prod of products) {
      const issues: string[] = [];
      const hasGtin = !!prod.gtin && prod.gtin.trim() !== '';
      const hasShipping = Array.isArray(prod.shipping) && prod.shipping.length > 0;
      
      const priceCurrency = prod.price?.currency || 'USD';
      const currencyMatch = priceCurrency === targetCurrency;

      if (!hasGtin) {
        issues.push('Missing GTIN (Global Trade Item Number) blocking AI Conversational Search matches.');
      }
      if (!hasShipping) {
        issues.push('Missing shipping rate table in GMC feed.');
      }
      if (!currencyMatch) {
        issues.push(`Currency mismatch: Feed contains '${priceCurrency}' but target market is '${targetCurrency}'.`);
      }

      results.push({
        productId: prod.id,
        title: prod.title || 'Untitled Product',
        hasGtin,
        hasShipping,
        currencyMatch,
        issues,
      });
    }

    return results;
  }

  private getMockHtmlForUrl(url: string): string {
    if (url.includes('energy-bar')) {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "name": "Premium Organic Energy Bar"
            }
          </script>
        </head>
        <body>
          <img src="/images/bar-front.jpg" alt="Premium Organic Energy Bar box layout" />
        </body>
        </html>
      `;
    }
    if (url.includes('hydration-powder')) {
      return `
        <!DOCTYPE html>
        <html>
        <body>
          <img src="/images/powder.jpg" /> <!-- Missing Alt, No JSON-LD -->
        </body>
        </html>
      `;
    }
    // Default fallback
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "WebPage"
          }
        </script>
      </head>
      <body>
        <img src="/images/hero.jpg" alt="Hero banner" />
        <img src="/images/product-details.jpg" /> <!-- Missing Alt -->
      </body>
      </html>
    `;
  }
}
