import Header from "@/components/site/Header";
import Hero from "@/components/site/Hero";
import Allocation from "@/components/site/Allocation";
import PhoneStory from "@/components/site/PhoneStory";
import LoanSavings from "@/components/site/LoanSavings";
import { DesktopSection, VideoSection } from "@/components/site/VideoDesktop";
import { Faq, Features, Security } from "@/components/site/Sections";
import Waitlist from "@/components/site/Waitlist";
import Footer from "@/components/site/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Allocation />
        <PhoneStory />
        <LoanSavings />
        <VideoSection />
        <DesktopSection />
        <Features />
        <Security />
        <Faq />
        <Waitlist />
      </main>
      <Footer />
    </>
  );
}
