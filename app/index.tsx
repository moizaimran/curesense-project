import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Colour tokens ─────────────────────────────────────────────────────────────
const C = {
  navy:      '#0B1437',
  navyMid:   '#121F5A',
  blue:      '#2563EB',
  blueLight: '#3B82F6',
  bluePale:  '#EFF6FF',
  white:     '#FFFFFF',
  offWhite:  '#F8FAFC',
  gray:      '#94A3B8',
  grayDark:  '#475569',
  text:      '#1E293B',
};

// ── Tiny reusable components ─────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return <Text style={s.sectionLabel}>{children}</Text>;
}

// ── Sections ─────────────────────────────────────────────────────────────────

function HeroSection({ top, onRegister, onLogin }: { top: number; onRegister: () => void; onLogin: () => void }) {
  return (
    <LinearGradient
      colors={['#0B1437', '#0F2060', '#1A3A9A']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.4, y: 1 }}
      style={[s.hero, { paddingTop: top + 24 }]}
    >
      {/* Nav bar */}
      <View style={s.navBar}>
        <View style={s.navLogo}>
          <View style={s.navLogoIcon} />
          <Text style={s.navLogoText}>CureSense</Text>
        </View>
        <View style={s.navActions}>
          <TouchableOpacity style={s.navRegister} onPress={onRegister}>
            <Text style={s.navRegisterText}>Register</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.navLogin} onPress={onLogin}>
            <Text style={s.navLoginText}>Login</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Hero content */}
      <View style={s.heroBadgeRow}>
        <View style={s.heroBadge}>
          <Text style={s.heroBadgeText}>✦  AI-Powered Clinical Intelligence</Text>
        </View>
      </View>

      <Text style={s.heroTitle}>
        Smarter{'\n'}
        <Text style={s.heroTitleAccent}>Diagnoses,{'\n'}</Text>
        Better{'\n'}Outcomes
      </Text>

      <Text style={s.heroSubtitle}>
        An intelligent healthcare platform that empowers clinicians with AI-assisted
        diagnostics, streamlined patient management, and actionable clinical insights.
      </Text>

      <View style={s.heroCTA}>
        <TouchableOpacity style={s.btnPrimary} activeOpacity={0.85} onPress={onRegister}>
          <Text style={s.btnPrimaryText}>Get Started  →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnOutlineLight} activeOpacity={0.85}>
          <Text style={s.btnOutlineLightText}>▶  Watch Demo</Text>
        </TouchableOpacity>
      </View>

      {/* Trust pills */}
      <View style={s.trustRow}>
        {['HIPAA-Aligned', 'End-to-End Encrypted', 'Role-Based Access', 'Full Audit Trails'].map(item => (
          <View key={item} style={s.trustPill}>
            <Text style={s.trustCheck}>✓  </Text>
            <Text style={s.trustText}>{item}</Text>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
}

function FeaturesStrip() {
  const features = [
    { icon: '🤖', title: 'AI-Powered',           desc: 'Machine learning models trained on clinical data to assist diagnosis.' },
    { icon: '🔒', title: 'Secure by Design',      desc: 'Your patient data is encrypted at rest and in transit.' },
    { icon: '📋', title: 'Structured Records',    desc: 'Organized, searchable patient histories always at your fingertips.' },
  ];
  return (
    <LinearGradient
      colors={['#1D4ED8', '#2563EB', '#3B82F6']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={s.strip}
    >
      {features.map(f => (
        <View key={f.title} style={s.stripItem}>
          <Text style={s.stripIcon}>{f.icon}</Text>
          <Text style={s.stripTitle}>{f.title}</Text>
          <Text style={s.stripDesc}>{f.desc}</Text>
        </View>
      ))}
    </LinearGradient>
  );
}

function PlatformFeatures() {
  const cards = [
    { icon: '💬', title: 'Dynamic AI Interview',      desc: 'An adaptive, conversational intake that asks smart follow-up questions based on your answers — covering symptom location, character, severity, duration, and more.' },
    { icon: '🧠', title: 'AI-Assisted Diagnostics',   desc: 'Your responses are processed through biomedical NER, a clinical knowledge base, and a disease-ranking model to surface evidence-based insights.' },
    { icon: '📋', title: 'Structured Clinical Report',desc: 'A full doctor report — entities, ranked diagnoses, medication flags, and guideline references — is generated and sent to your clinician automatically.' },
    { icon: '🛡️', title: 'Secure & Compliant',        desc: 'Role-based access control, end-to-end encryption, and comprehensive audit trails keep your health data safe at every step.' },
  ];
  return (
    <View style={s.section}>
      <SectionLabel>PLATFORM FEATURES</SectionLabel>
      <Text style={s.sectionHeading}>Everything clinicians need</Text>
      <Text style={s.sectionSub}>Built for the modern healthcare environment — powerful, intuitive, and secure.</Text>
      <View style={s.cardGrid}>
        {cards.map(c => (
          <View key={c.title} style={s.featureCard}>
            <View style={s.featureCardIcon}>
              <Text style={{ fontSize: 22 }}>{c.icon}</Text>
            </View>
            <Text style={s.featureCardTitle}>{c.title}</Text>
            <Text style={s.featureCardDesc}>{c.desc}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: '01', title: 'Describe Your Symptoms',
      desc: 'Open the app and tell the AI how you\'re feeling — in your own words, by text or voice, in any language.',
    },
    {
      n: '02', title: 'Dynamic AI Interview',
      desc: 'The AI conducts a structured clinical conversation, adapting follow-up questions to your answers. It covers symptom site, character, severity, duration, radiation, triggers, medications, and allergies — like a doctor, before the doctor.',
    },
    {
      n: '03', title: 'Instant Clinical Analysis',
      desc: 'Your intake is processed through biomedical entity extraction, a 44,000-entry medical knowledge base, and a disease-ranking model trained on 360,000 symptom records.',
    },
    {
      n: '04', title: 'Report Lands with Your Doctor',
      desc: 'A full structured clinical report — ranked diagnoses, guideline references, medication flags, and a plain-language patient summary — is ready for your clinician before your appointment.',
    },
  ];
  return (
    <View style={[s.section, { backgroundColor: C.offWhite }]}>
      <SectionLabel>HOW IT WORKS</SectionLabel>
      <Text style={s.sectionHeading}>From your words to your doctor's desk</Text>
      <Text style={s.sectionSub}>CureSense replaces paper forms with an intelligent AI conversation that extracts everything a clinician needs.</Text>

      {/* Interview preview chip */}
      <View style={s.interviewChip}>
        <View style={s.interviewDot} />
        <Text style={s.interviewChipText}>AI Interview · Adaptive · Multilingual · Voice & Text</Text>
      </View>

      {steps.map(step => (
        <View key={step.n} style={s.stepRow}>
          <View style={s.stepBadge}>
            <Text style={s.stepNum}>{step.n}</Text>
          </View>
          <View style={s.stepContent}>
            <Text style={s.stepTitle}>{step.title}</Text>
            <Text style={s.stepDesc}>{step.desc}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}


function CTABanner({ onRegister, onLogin }: { onRegister: () => void; onLogin: () => void }) {
  return (
    <LinearGradient colors={['#0B1437', '#1A237E']} style={s.cta}>
      <Text style={s.ctaHeading}>Ready to transform your practice?</Text>
      <Text style={s.ctaSub}>Join healthcare professionals using CureSense to deliver smarter, more confident care.</Text>
      <View style={s.ctaButtons}>
        <TouchableOpacity style={s.btnPrimary} activeOpacity={0.85} onPress={onRegister}>
          <Text style={s.btnPrimaryText}>Create Account  →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btnOutlineLight, { marginLeft: 12 }]} activeOpacity={0.85} onPress={onLogin}>
          <Text style={s.btnOutlineLightText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

function Footer({ bottom }: { bottom: number }) {
  return (
    <View style={[s.footer, { paddingBottom: bottom + 24 }]}>
      <View style={s.footerLogo}>
        <View style={s.navLogoIcon} />
        <Text style={s.footerLogoText}>CureSense</Text>
      </View>
      <Text style={s.footerDesc}>
        An AI-powered clinical intelligence platform designed to support healthcare
        professionals with smarter diagnostics and streamlined patient management.
      </Text>
      <Text style={s.footerBadge}>HIPAA-aligned & Secure</Text>

      <View style={s.footerLinks}>
        <View style={s.footerCol}>
          <Text style={s.footerColHead}>Platform</Text>
          {['Features', 'How It Works', 'For Practitioners', 'Login'].map(l => (
            <Text key={l} style={s.footerLink}>{l}</Text>
          ))}
        </View>
        <View style={s.footerCol}>
          <Text style={s.footerColHead}>Legal</Text>
          {['Privacy Policy', 'Terms of Service', 'Data Security'].map(l => (
            <Text key={l} style={s.footerLink}>{l}</Text>
          ))}
        </View>
      </View>

      <View style={s.footerBottom}>
        <Text style={s.footerCopy}>© 2026 CureSense. All rights reserved.</Text>
        <Text style={s.footerBuilt}>Built with ♥ for better healthcare</Text>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const insets = useSafeAreaInsets();
  const router  = useRouter();

  const goRegister = () => router.push('/(auth)/register' as any);
  const goLogin    = () => router.push('/(auth)/login' as any);

  return (
    <>
      <StatusBar style="light" />
      <ScrollView style={s.root} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <HeroSection top={insets.top} onRegister={goRegister} onLogin={goLogin} />
        <FeaturesStrip />
        <PlatformFeatures />
        <HowItWorks />
        <CTABanner onRegister={goRegister} onLogin={goLogin} />
        <Footer bottom={insets.bottom} />
      </ScrollView>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.white },
  content: { flexGrow: 1 },

  // ── Hero
  hero:           { paddingHorizontal: 20, paddingBottom: 36 },
  navBar:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 48 },
  navLogo:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navLogoIcon:    { width: 28, height: 28, borderRadius: 6, backgroundColor: C.blue },
  navLogoText:    { color: C.white, fontWeight: '700', fontSize: 16 },
  navActions:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navRegister:    { paddingVertical: 6, paddingHorizontal: 14 },
  navRegisterText:{ color: C.white, fontSize: 14, opacity: 0.85 },
  navLogin:       { backgroundColor: C.blue, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 16 },
  navLoginText:   { color: C.white, fontSize: 14, fontWeight: '600' },

  heroBadgeRow:   { alignItems: 'center', marginBottom: 24 },
  heroBadge:      { borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroBadgeText:  { color: C.white, fontSize: 12, letterSpacing: 0.3 },

  heroTitle:      { color: C.white, fontSize: 42, fontWeight: '800', lineHeight: 50, textAlign: 'center', marginBottom: 16 },
  heroTitleAccent:{ color: 'rgba(255,255,255,0.45)' },
  heroSubtitle:   { color: 'rgba(255,255,255,0.70)', fontSize: 15, lineHeight: 24, textAlign: 'center', marginBottom: 32 },

  heroCTA:        { flexDirection: 'row', gap: 12, justifyContent: 'center', marginBottom: 36 },

  trustRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  trustPill:      { flexDirection: 'row', alignItems: 'center' },
  trustCheck:     { color: '#60A5FA', fontSize: 11 },
  trustText:      { color: 'rgba(255,255,255,0.60)', fontSize: 11 },

  // ── Buttons
  btnPrimary:         { backgroundColor: C.blue, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 24 },
  btnPrimaryText:     { color: C.white, fontWeight: '700', fontSize: 15 },
btnOutlineLight:    { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.40)', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 24 },
  btnOutlineLightText:{ color: C.white, fontWeight: '600', fontSize: 15 },

  // ── Strip
  strip:     { flexDirection: 'row', paddingVertical: 28, paddingHorizontal: 20, gap: 0 },
  stripItem: { flex: 1, alignItems: 'center', paddingHorizontal: 8, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.2)' },
  stripIcon: { fontSize: 24, marginBottom: 8 },
  stripTitle:{ color: C.white, fontWeight: '700', fontSize: 13, textAlign: 'center', marginBottom: 4 },
  stripDesc: { color: 'rgba(255,255,255,0.70)', fontSize: 11, textAlign: 'center', lineHeight: 16 },

  // ── Sections
  section:         { paddingVertical: 48, paddingHorizontal: 20, backgroundColor: C.white },
  sectionLabel:    { color: C.blue, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textAlign: 'center', marginBottom: 8, textTransform: 'uppercase' },
  sectionHeading:  { color: C.text, fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 12, lineHeight: 36 },
  sectionSub:      { color: C.grayDark, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 32 },

  // ── Feature cards
  cardGrid:       { gap: 16 },
  featureCard:    { backgroundColor: C.offWhite, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  featureCardIcon:{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.bluePale, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  featureCardTitle:{ color: C.text, fontWeight: '700', fontSize: 16, marginBottom: 8 },
  featureCardDesc: { color: C.grayDark, fontSize: 13, lineHeight: 20 },

  // ── How it works
  videoBox:     { backgroundColor: '#1E293B', borderRadius: 16, height: 180, alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  videoPlay:    { width: 52, height: 52, borderRadius: 26, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  videoCaption: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },

  interviewChip:     { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', backgroundColor: C.bluePale, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16, marginBottom: 28, gap: 8 },
  interviewDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: C.blue },
  interviewChipText: { color: C.blue, fontSize: 12, fontWeight: '600' },

  stepRow:     { flexDirection: 'row', gap: 16, marginBottom: 24 },
  stepBadge:   { width: 40, height: 40, borderRadius: 10, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNum:     { color: C.white, fontWeight: '800', fontSize: 13 },
  stepContent: { flex: 1 },
  stepTitle:   { color: C.text, fontWeight: '700', fontSize: 15, marginBottom: 4 },
  stepDesc:    { color: C.grayDark, fontSize: 13, lineHeight: 20 },

  // ── CTA
  cta:        { padding: 40, alignItems: 'center' },
  ctaHeading: { color: C.white, fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 12, lineHeight: 36 },
  ctaSub:     { color: 'rgba(255,255,255,0.65)', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  ctaButtons: { flexDirection: 'row', alignItems: 'center' },

  // ── Footer
  footer:        { backgroundColor: C.navy, padding: 32 },
  footerLogo:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  footerLogoText:{ color: C.white, fontWeight: '700', fontSize: 15 },
  footerDesc:    { color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 20, marginBottom: 8 },
  footerBadge:   { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginBottom: 28 },
  footerLinks:   { flexDirection: 'row', gap: 40, marginBottom: 28 },
  footerCol:     { gap: 10 },
  footerColHead: { color: C.white, fontWeight: '700', fontSize: 13, marginBottom: 4 },
  footerLink:    { color: 'rgba(255,255,255,0.50)', fontSize: 12 },
  footerBottom:  { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)', paddingTop: 20, flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  footerCopy:    { color: 'rgba(255,255,255,0.35)', fontSize: 11 },
  footerBuilt:   { color: 'rgba(255,255,255,0.35)', fontSize: 11 },
});
