import Header from "@/components/site/Header";
import Hero from "@/components/site/Hero";
import MonthBands from "@/components/site/MonthBands";
import { Faq, Features, Security } from "@/components/site/Sections";
import Waitlist from "@/components/site/Waitlist";
import Footer from "@/components/site/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <MonthBands />
        <Features />
        <Security />
        <Faq />
        <Waitlist />
      </main>
      <Footer />
    </>
  );
}
