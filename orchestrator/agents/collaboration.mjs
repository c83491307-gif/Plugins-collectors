export class Collaboration {
  constructor(graph){this.graph=graph;}
  async run({input,executor,reviewer}){this.graph.addNode({id:"executor",run:executor});this.graph.addNode({id:"reviewer",dependsOn:["executor"],run:reviewer});return this.graph.run(input);}
}