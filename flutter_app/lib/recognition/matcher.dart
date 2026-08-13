library;

import 'dart:math' as math;

import '../config.dart';

double cosineSimilarity(List<double> a, List<double> b) {
  var dot = 0.0;
  var na = 0.0;
  var nb = 0.0;
  final n = a.length < b.length ? a.length : b.length;
  for (var i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na == 0 || nb == 0) {
    return 0;
  }
  return dot / (math.sqrt(na) * math.sqrt(nb));
}

List<double> l2Normalize(List<double> value) {
  var norm = 0.0;
  for (final item in value) {
    norm += item * item;
  }
  norm = math.sqrt(norm);
  if (norm == 0) {
    return List<double>.filled(value.length, 0);
  }
  return value.map((item) => item / norm).toList();
}

List<double> compactEmbedding(
  List<double> embedding, {
  int targetLength = 128,
}) {
  if (embedding.isEmpty) {
    return const [];
  }
  if (embedding.length == targetLength) {
    return l2Normalize(embedding);
  }
  if (embedding.length < targetLength) {
    return l2Normalize(embedding);
  }

  final bucketSize = embedding.length / targetLength;
  final compacted = List<double>.filled(targetLength, 0);
  for (var i = 0; i < targetLength; i++) {
    final start = (i * bucketSize).floor();
    final end =
        ((i + 1) * bucketSize).floor().clamp(start + 1, embedding.length);
    var sum = 0.0;
    var count = 0;
    for (var index = start; index < end; index++) {
      sum += embedding[index];
      count += 1;
    }
    compacted[i] = count == 0 ? 0 : sum / count;
  }
  return l2Normalize(compacted);
}

List<double> fuseEmbeddings(List<List<double>> embeddings) {
  if (embeddings.isEmpty) {
    return const [];
  }
  final sum = List<double>.filled(embeddings.first.length, 0);
  for (final embedding in embeddings) {
    for (var i = 0; i < sum.length && i < embedding.length; i++) {
      sum[i] += embedding[i];
    }
  }
  return l2Normalize(sum);
}

List<double> robustFuse(List<List<double>> embeddings,
    {double keepCosine = 0.80}) {
  if (embeddings.isEmpty) {
    return const [];
  }
  var current = fuseEmbeddings(embeddings);
  for (var iteration = 0; iteration < 4; iteration++) {
    final kept = embeddings
        .where(
            (embedding) => cosineSimilarity(embedding, current) >= keepCosine)
        .toList();
    if (kept.isEmpty || kept.length == embeddings.length) {
      break;
    }
    current = fuseEmbeddings(kept);
  }
  return current;
}

class TemplateCandidate {
  const TemplateCandidate(this.employeeCode, this.employeeName, this.embedding);

  final String employeeCode;
  final String employeeName;
  final List<double> embedding;
}

class MatchResult {
  const MatchResult({
    required this.employeeCode,
    required this.employeeName,
    required this.score,
    required this.margin,
    required this.ambiguous,
  });

  final String? employeeCode;
  final String? employeeName;
  final double score;
  final double margin;
  final bool ambiguous;

  bool get matched => employeeCode != null && !ambiguous;
}

MatchResult matchEmbedding(
  List<double> query,
  List<TemplateCandidate> candidates, {
  double acceptThreshold = kAcceptThreshold,
  double ambiguityMargin = kAmbiguityMargin,
}) {
  String? bestCode;
  String? bestName;
  var bestScore = -2.0;
  var secondScore = -2.0;

  for (final candidate in candidates) {
    final score = cosineSimilarity(query, candidate.embedding);
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestCode = candidate.employeeCode;
      bestName = candidate.employeeName;
    } else if (score > secondScore && candidate.employeeCode != bestCode) {
      secondScore = score;
    }
  }

  if (bestCode == null) {
    return const MatchResult(
      employeeCode: null,
      employeeName: null,
      score: -1,
      margin: 0,
      ambiguous: false,
    );
  }

  final margin = bestScore - secondScore;
  final ambiguous = margin < ambiguityMargin;
  final accepted = bestScore >= acceptThreshold;
  return MatchResult(
    employeeCode: accepted ? bestCode : null,
    employeeName: accepted ? bestName : null,
    score: bestScore,
    margin: margin,
    ambiguous: ambiguous && accepted,
  );
}
