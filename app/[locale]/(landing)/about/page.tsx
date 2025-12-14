import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BookOpen, Code, LineChart } from "lucide-react"

export default function AboutPage() {
  const founderSkills = [
    { name: "ICT Concepts", icon: <BookOpen className="w-4 h-4" /> },
    { name: "Computer Science", icon: <Code className="w-4 h-4" /> },
    { name: "Trading Fundamentals", icon: <LineChart className="w-4 h-4" /> }
  ]

  return (
    <div className="px-4 py-12 bg-background text-foreground">
      <h1 className="text-4xl font-bold text-center mb-8">About This Deltalytix Instance</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-2xl">Our Mission</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This deployment is a self-hosted copy of the open-source Deltalytix project, maintained by Kavin for personal use and a small community. It follows the spirit of the original platform by providing advanced analytics and AI-driven insights, while remaining independent from the official Deltalytix team.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-2xl">About Kavin</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Kavin has about one year of trading experience with a focus on ICT concepts, reinforced by a background in computer science. Hosting and maintaining this copy of Deltalytix allows him to experiment with strategy tracking and share the tools with others.
            </p>
            <p className="text-muted-foreground">
              This instance is not owned by or affiliated with the official Deltalytix team; it is a community-focused deployment operated independently by Kavin.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card md:col-span-2">
          <CardHeader>
            <CardTitle className="text-2xl">Founder&apos;s Expertise</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {founderSkills.map((skill, index) => (
                <Badge key={index} variant="secondary" className="text-sm py-1 px-2 flex items-center gap-1">
                  {skill.icon}
                  {skill.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card md:col-span-2">
          <CardHeader>
            <CardTitle className="text-2xl">Why Deltalytix?</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Self-hosted copy of the open-source Deltalytix project</li>
              <li>Maintained by Kavin to support personal learning and community members</li>
              <li>Advanced analytics and AI insights preserved from the original platform</li>
              <li>Transparent about independence from the official Deltalytix team</li>
              <li>Available to members who may contribute fees to cover hosting and maintenance</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}