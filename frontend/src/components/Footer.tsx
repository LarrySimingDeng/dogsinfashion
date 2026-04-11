import { PawPrint, Phone, MessageCircle, Mail } from 'lucide-react'

const quickLinks = [
  { href: '#about', label: 'About Doris' },
  { href: '#services', label: 'Services & Pricing' },
  { href: '#areas', label: 'Service Areas' },
  { href: '#booking', label: 'Book Now' },
]

const contacts = [
  { icon: Phone, label: '(916) 287-1878', href: 'tel:+19162871878' },
  { icon: MessageCircle, label: 'Text Doris', href: 'sms:+19162871878' },
  { icon: Mail, label: 'Email', href: 'mailto:contact@dogsinfashion.com' },
]

export default function Footer() {
  return (
    <footer className="bg-warm-dark px-6 pb-8 pt-14 text-white/70">
      <div className="mx-auto grid max-w-[1000px] gap-12 md:grid-cols-[2fr_1fr_1fr]">
        {/* Brand */}
        <div>
          <a
            href="#"
            className="mb-3 flex items-center gap-2.5 font-display text-xl font-bold text-sky-deep no-underline"
          >
            <PawPrint className="h-6 w-6" />
            Dogs in Fashion
          </a>
          <p className="text-sm leading-7">
            Professional mobile dog grooming serving Davis, Sacramento,
            Woodland, and surrounding areas. We bring the salon to your
            doorstep.
          </p>
        </div>

        {/* Quick Links */}
        <div>
          <h4 className="mb-3.5 text-sm font-bold text-white">Quick Links</h4>
          {quickLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="block py-1 text-sm text-white/60 no-underline transition-colors hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </div>

        {/* Contact */}
        <div>
          <h4 className="mb-3.5 text-sm font-bold text-white">Contact</h4>
          {contacts.map((c) => (
            <a
              key={c.href}
              href={c.href}
              className="flex items-center gap-2 py-1 text-sm text-white/60 no-underline transition-colors hover:text-white"
            >
              <c.icon className="h-3.5 w-3.5" />
              {c.label}
            </a>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-[1000px] border-t border-white/10 pt-5 text-center text-xs">
        &copy; {new Date().getFullYear()} Dogs in Fashion Mobile Grooming —
        www.dogsinfashion.com
      </div>
    </footer>
  )
}
